import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import getPool from '@/lib/db/mysql';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    return NextResponse.json(
      { error: 'invalid parking-lot id' },
      { status: 400 }
    );
  }

  try {
    const pool = getPool();

    const [lotRows] = await pool.query<RowDataPacket[]>(
      'SELECT lot_id, description, location, price, total_slot FROM parking_lots WHERE lot_id = ?',
      [id]
    );
    if (lotRows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    const lot = lotRows[0];

    const [revRows] = await pool.query<RowDataPacket[]>(
      `SELECT r.score, r.comment, u.username
       FROM reviews r
       JOIN bookings b ON b.b_id = r.b_id
       JOIN users u ON u.user_id = b.user_id
       WHERE b.lot_id = ?`,
      [id]
    );

    return NextResponse.json({
      lot,
      reviews: revRows,
      vehicleTypes: [], // TODO: เติมเมื่อมี spec
      rules: [],
    });
  } catch (err) {
    console.error('parkingdetail GET failed', err);
    return NextResponse.json(
      { error: 'internal server error' },
      { status: 500 }
    );
  }
}