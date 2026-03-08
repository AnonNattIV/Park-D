import { NextRequest, NextResponse } from 'next/server';
import { listHomeParkingLots } from '@/lib/parking-lots';
import { runBookingCheckoutAutomation } from '@/lib/booking-checkout';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    try {
      await runBookingCheckoutAutomation();
    } catch (automationError) {
      console.error('Unable to run booking checkout automation:', automationError);
    }

    const { searchParams } = new URL(request.url);
    const locationFilter = searchParams.get('location') || '';
    const parkingLots = await listHomeParkingLots(locationFilter);

    return NextResponse.json({ parkingLots });
  } catch (error) {
    console.error('Unable to load parking lots:', error);
    return NextResponse.json(
      { error: 'Unable to load parking lots right now' },
      { status: 500 }
    );
  }
}
