import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { verifyToken } from '@/lib/auth';
import getPool from '@/lib/db/mysql';
import { listParkingLotSystemRows } from '@/lib/parking-lots';
import { ensureParkingLotMetadataSchema } from '@/lib/parking-lot-metadata';
import {
  buildLocationMetadataDbPayload,
  buildNormalizedLocationLabel,
  LocationNormalizationService,
} from '@/lib/location-normalization';
import {
  deleteParkingLotEvidenceByUrl,
  deleteParkingLotImageByUrl,
  uploadParkingLotEvidence,
  uploadParkingLotImage,
} from '@/lib/storage';

export const dynamic = 'force-dynamic';

type TokenPayload = {
  userId?: string;
  role?: string;
};

interface OwnerProfileRow extends RowDataPacket {
  user_id: number;
}

const MAX_IMAGE_FILES = 5;
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const METADATA_LOCATION_COLUMNS = [
  'raw_name',
  'raw_address',
  'raw_house_number',
  'raw_district',
  'raw_amphoe',
  'raw_subdistrict',
  'raw_province',
  'raw_latitude',
  'raw_longitude',
  'raw_input_lang',
  'place_id',
  'normalized_name_en',
  'normalized_name_th',
  'normalized_address_en',
  'normalized_address_th',
  'normalized_house_number',
  'normalized_district_en',
  'normalized_district_th',
  'normalized_amphoe_en',
  'normalized_amphoe_th',
  'normalized_subdistrict_en',
  'normalized_subdistrict_th',
  'normalized_province_en',
  'normalized_province_th',
  'normalized_country_code',
  'normalized_latitude',
  'normalized_longitude',
  'resolution_status',
  'resolution_source',
  'confidence_score',
  'is_fallback_translation',
  'display_lot_name_th',
  'display_location_th',
  'display_address_line_th',
  'display_street_number_th',
  'display_district_th',
  'display_amphoe_th',
  'display_subdistrict_th',
  'display_province_th',
] as const;

type MetadataLocationColumn = (typeof METADATA_LOCATION_COLUMNS)[number];

type CreateParkingLotPayload = {
  lotName: string;
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
  latitude: number | null;
  longitude: number | null;
  description: string;
  vehicleTypes: string[];
  rules: string[];
  totalSlot: number;
  price: number;
  imageFiles: File[];
  ownershipEvidenceFile: File | null;
};

function buildRawLocationLabel(payload: {
  addressLine: string;
  streetNumber: string;
  district: string;
  amphoe: string;
  subdistrict: string;
  province: string;
}): string {
  return buildNormalizedLocationLabel([
    payload.addressLine,
    payload.streetNumber,
    payload.subdistrict,
    payload.district,
    payload.amphoe,
    payload.province,
  ]);
}

function normalizeStringArray(value: unknown): string[] {
  const uniqueValues = new Set<string>();

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item !== 'string') {
        return;
      }

      const normalizedItem = item.trim();
      if (!normalizedItem) {
        return;
      }

      uniqueValues.add(normalizedItem);
    });

    return Array.from(uniqueValues);
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return [];
    }

    try {
      const parsed = JSON.parse(normalizedValue) as unknown;
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (typeof item !== 'string') {
            return;
          }

          const normalizedItem = item.trim();
          if (!normalizedItem) {
            return;
          }

          uniqueValues.add(normalizedItem);
        });

        return Array.from(uniqueValues);
      }
    } catch {
      // fall back to comma/newline parser
    }

    normalizedValue
      .split('\n')
      .flatMap((line) => line.split(','))
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => uniqueValues.add(item));
  }

  return Array.from(uniqueValues);
}

function readFormStringRaw(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function readFormNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== 'string') {
    return Number.NaN;
  }

  return Number(value);
}

function normalizeImageFiles(values: FormDataEntryValue[]): File[] {
  return values
    .filter((value): value is File => value instanceof File)
    .filter((file) => file.size > 0);
}

function normalizeEvidenceFile(value: FormDataEntryValue | null): File | null {
  if (!(value instanceof File)) {
    return null;
  }

  return value.size > 0 ? value : null;
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function readRequester(request: NextRequest): { userId: number; role: string } | null {
  const token = readBearerToken(request);

  if (!token) {
    return null;
  }

  const payload = verifyToken(token) as TokenPayload | null;
  const role = payload?.role?.toLowerCase() || '';
  const userId = Number(payload?.userId);

  if (!payload || !Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  return {
    userId,
    role,
  };
}

async function readCreateParkingLotPayload(
  request: NextRequest
): Promise<CreateParkingLotPayload> {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    return {
      lotName: readFormStringRaw(formData.get('lotName')),
      addressLine: readFormStringRaw(formData.get('addressLine')),
      streetNumber: readFormStringRaw(formData.get('streetNumber')),
      district: readFormStringRaw(formData.get('district')),
      amphoe: readFormStringRaw(formData.get('amphoe')),
      subdistrict: readFormStringRaw(formData.get('subdistrict')),
      province: readFormStringRaw(formData.get('province')),
      latitude: (() => {
        const value = formData.get('latitude');
        if (value === null || value === '') {
          return null;
        }
        const parsed = readFormNumber(value);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      })(),
      longitude: (() => {
        const value = formData.get('longitude');
        if (value === null || value === '') {
          return null;
        }
        const parsed = readFormNumber(value);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      })(),
      description: readFormStringRaw(formData.get('description')),
      vehicleTypes: normalizeStringArray(formData.get('vehicleTypes')),
      rules: normalizeStringArray(formData.get('rules')),
      totalSlot: readFormNumber(formData.get('totalSlot')),
      price: readFormNumber(formData.get('price')),
      imageFiles: normalizeImageFiles(formData.getAll('images')),
      ownershipEvidenceFile: normalizeEvidenceFile(formData.get('ownershipEvidence')),
    };
  }

  const body = await request.json();
  return {
    lotName: typeof body?.lotName === 'string' ? body.lotName : '',
    addressLine: typeof body?.addressLine === 'string' ? body.addressLine : '',
    streetNumber: typeof body?.streetNumber === 'string' ? body.streetNumber : '',
    district: typeof body?.district === 'string' ? body.district : '',
    amphoe: typeof body?.amphoe === 'string' ? body.amphoe : '',
    subdistrict: typeof body?.subdistrict === 'string' ? body.subdistrict : '',
    province: typeof body?.province === 'string' ? body.province : '',
    latitude:
      body?.latitude === null || body?.latitude === undefined || body?.latitude === ''
        ? null
        : Number(body.latitude),
    longitude:
      body?.longitude === null || body?.longitude === undefined || body?.longitude === ''
        ? null
        : Number(body.longitude),
    description: typeof body?.description === 'string' ? body.description : '',
    vehicleTypes: normalizeStringArray(body?.vehicleTypes),
    rules: normalizeStringArray(body?.rules),
    totalSlot: Number(body?.totalSlot),
    price: Number(body?.price),
    imageFiles: [],
    ownershipEvidenceFile: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parkingLots = await listParkingLotSystemRows(requester.userId, requester.role);
    return NextResponse.json({ parkingLots });
  } catch (error) {
    console.error('Unable to load parking lot system data:', error);
    return NextResponse.json(
      { error: 'Unable to load parking lot system data right now' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const requester = readRequester(request);
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'owner' && requester.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await readCreateParkingLotPayload(request);
    const lotNameRaw = payload.lotName;
    const addressLineRaw = payload.addressLine;
    const streetNumberRaw = payload.streetNumber;
    const districtRaw = payload.district;
    const amphoeRaw = payload.amphoe;
    const subdistrictRaw = payload.subdistrict;
    const provinceRaw = payload.province;
    const rawLatitude = payload.latitude;
    const rawLongitude = payload.longitude;
    const descriptionRaw = payload.description;
    const vehicleTypes = payload.vehicleTypes;
    const rules = payload.rules;
    const totalSlotRaw = payload.totalSlot;
    const priceRaw = payload.price;
    const imageFiles = payload.imageFiles;
    const ownershipEvidenceFile = payload.ownershipEvidenceFile;

    const lotName = lotNameRaw.trim();
    const addressLine = addressLineRaw.trim();
    const streetNumber = streetNumberRaw.trim();
    const district = districtRaw.trim();
    const amphoe = amphoeRaw.trim();
    const subdistrict = subdistrictRaw.trim();
    const province = provinceRaw.trim();

    if (!lotName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!addressLine) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    if (!streetNumber) {
      return NextResponse.json({ error: 'Number is required' }, { status: 400 });
    }

    if (!district) {
      return NextResponse.json({ error: 'District is required' }, { status: 400 });
    }

    if (!amphoe) {
      return NextResponse.json({ error: 'Amphoe is required' }, { status: 400 });
    }

    if (!subdistrict) {
      return NextResponse.json({ error: 'Subdistrict is required' }, { status: 400 });
    }

    if (!province) {
      return NextResponse.json({ error: 'Province is required' }, { status: 400 });
    }

    if (!Number.isInteger(totalSlotRaw) || totalSlotRaw <= 0) {
      return NextResponse.json({ error: 'Total slot must be a positive integer' }, { status: 400 });
    }

    if (!Number.isFinite(priceRaw) || priceRaw <= 0) {
      return NextResponse.json({ error: 'Price must be greater than 0' }, { status: 400 });
    }

    if (imageFiles.length === 0) {
      return NextResponse.json(
        { error: 'At least one parking lot image is required' },
        { status: 400 }
      );
    }

    if (!ownershipEvidenceFile) {
      return NextResponse.json(
        { error: 'Ownership evidence file (pdf/image) is required' },
        { status: 400 }
      );
    }

    if (imageFiles.length > MAX_IMAGE_FILES) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_IMAGE_FILES} images` },
        { status: 400 }
      );
    }

    for (const imageFile of imageFiles) {
      if (!imageFile.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Only image files are allowed for parking lot images' },
          { status: 400 }
        );
      }

      if (imageFile.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: 'Each parking lot image must be 5 MB or smaller' },
          { status: 400 }
        );
      }
    }

    const evidenceContentType = ownershipEvidenceFile.type || '';
    const isEvidenceImage = evidenceContentType.startsWith('image/');
    const isEvidencePdf = evidenceContentType === 'application/pdf';

    if (!isEvidenceImage && !isEvidencePdf) {
      return NextResponse.json(
        { error: 'Ownership evidence must be a PDF or image file' },
        { status: 400 }
      );
    }

    if (ownershipEvidenceFile.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Ownership evidence file must be 10 MB or smaller' },
        { status: 400 }
      );
    }

    if ((rawLatitude === null) !== (rawLongitude === null)) {
      return NextResponse.json(
        { error: 'Both latitude and longitude are required when filling coordinates' },
        { status: 400 }
      );
    }

    if (rawLatitude !== null) {
      if (!Number.isFinite(rawLatitude) || rawLatitude < -90 || rawLatitude > 90) {
        return NextResponse.json({ error: 'Latitude must be between -90 and 90' }, { status: 400 });
      }
    }

    if (rawLongitude !== null) {
      if (!Number.isFinite(rawLongitude) || rawLongitude < -180 || rawLongitude > 180) {
        return NextResponse.json({ error: 'Longitude must be between -180 and 180' }, { status: 400 });
      }
    }

    const rawLocation = buildRawLocationLabel({
      addressLine: addressLineRaw,
      streetNumber: streetNumberRaw,
      district: districtRaw,
      amphoe: amphoeRaw,
      subdistrict: subdistrictRaw,
      province: provinceRaw,
    });

    if (!rawLocation) {
      return NextResponse.json(
        { error: 'Unable to build location from address fields' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const [ownerRows] = await pool.query<OwnerProfileRow[]>(
      `SELECT user_id
      FROM owner_profiles
      WHERE user_id = ?
      LIMIT 1`,
      [requester.userId]
    );

    if (ownerRows.length === 0) {
      return NextResponse.json(
        { error: 'Only approved owners can create parking lot requests' },
        { status: 403 }
      );
    }

    const normalizer = new LocationNormalizationService();
    const normalizationResult = await normalizer.normalize({
      name: lotNameRaw,
      address: addressLineRaw,
      houseNumber: streetNumberRaw,
      district: districtRaw,
      amphoe: amphoeRaw,
      subdistrict: subdistrictRaw,
      province: provinceRaw,
      latitude: rawLatitude,
      longitude: rawLongitude,
    });

    const [insertResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO parking_lots (
        owner_user_id,
        lot_name,
        description,
        is_approve,
        p_status,
        location,
        address_line,
        street_number,
        district,
        amphoe,
        subdistrict,
        province,
        latitude,
        longitude,
        total_slot,
        price,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        requester.userId,
        lotNameRaw || null,
        descriptionRaw || null,
        rawLocation,
        addressLineRaw || null,
        streetNumberRaw || null,
        districtRaw || null,
        amphoeRaw || null,
        subdistrictRaw || null,
        provinceRaw || null,
        rawLatitude,
        rawLongitude,
        totalSlotRaw,
        priceRaw,
      ]
    );

    const uploadedImageUrls: string[] = [];
    let uploadedEvidenceUrl: string | null = null;

    try {
      uploadedEvidenceUrl = await uploadParkingLotEvidence(
        ownershipEvidenceFile,
        requester.userId,
        insertResult.insertId
      );

      for (let index = 0; index < imageFiles.length; index += 1) {
        const imageUrl = await uploadParkingLotImage(
          imageFiles[index],
          requester.userId,
          insertResult.insertId,
          index + 1
        );
        uploadedImageUrls.push(imageUrl);
      }
    } catch (uploadError) {
      console.error('Unable to upload parking lot files:', uploadError);
      await Promise.allSettled(
        uploadedImageUrls.map((imageUrl) => deleteParkingLotImageByUrl(imageUrl))
      );
      await deleteParkingLotEvidenceByUrl(uploadedEvidenceUrl);
      await pool.query(
        `DELETE FROM parking_lots
        WHERE lot_id = ?
        LIMIT 1`,
        [insertResult.insertId]
      );

      return NextResponse.json(
        { error: 'Unable to upload parking lot files right now' },
        { status: 500 }
      );
    }

    try {
      await ensureParkingLotMetadataSchema();

      const metadataLocationPayload = buildLocationMetadataDbPayload(
        lotNameRaw,
        normalizationResult
      );

      const metadataLocationValues = METADATA_LOCATION_COLUMNS.map(
        (column) => metadataLocationPayload[column as MetadataLocationColumn]
      );

      await pool.query(
        `INSERT INTO parking_lot_metadata (
          lot_id,
          vehicle_types_json,
          rules_json,
          image_urls_json,
          owner_evidence_url,
          ${METADATA_LOCATION_COLUMNS.join(',\n          ')}
        )
        VALUES (?, ?, ?, ?, ?, ${METADATA_LOCATION_COLUMNS.map(() => '?').join(', ')})
        ON DUPLICATE KEY UPDATE
          vehicle_types_json = VALUES(vehicle_types_json),
          rules_json = VALUES(rules_json),
          image_urls_json = VALUES(image_urls_json),
          owner_evidence_url = VALUES(owner_evidence_url),
          ${METADATA_LOCATION_COLUMNS.map((column) => `${column} = VALUES(${column})`).join(',\n          ')},
          updated_at = CURRENT_TIMESTAMP`,
        [
          insertResult.insertId,
          vehicleTypes.length > 0 ? JSON.stringify(vehicleTypes) : null,
          rules.length > 0 ? JSON.stringify(rules) : null,
          uploadedImageUrls.length > 0 ? JSON.stringify(uploadedImageUrls) : null,
          uploadedEvidenceUrl,
          ...metadataLocationValues,
        ]
      );
    } catch (metadataError) {
      console.error('Unable to save parking lot metadata:', metadataError);
      await Promise.allSettled(
        uploadedImageUrls.map((imageUrl) => deleteParkingLotImageByUrl(imageUrl))
      );
      await deleteParkingLotEvidenceByUrl(uploadedEvidenceUrl);
      await pool.query(
        `DELETE FROM parking_lots
        WHERE lot_id = ?
        LIMIT 1`,
        [insertResult.insertId]
      );

      return NextResponse.json(
        { error: 'Unable to save parking lot metadata right now' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Parking lot request submitted',
      parkingLot: {
        id: insertResult.insertId,
        status: 'REQUEST',
      },
    });
  } catch (error) {
    console.error('Unable to create parking lot request:', error);
    return NextResponse.json(
      { error: 'Unable to create parking lot request right now' },
      { status: 500 }
    );
  }
}
