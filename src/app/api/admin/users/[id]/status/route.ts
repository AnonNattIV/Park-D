import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db/mysql"; 

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = parseInt(params.id);
    const body = await request.json();
    const { status } = body; 

    if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // ⭐️ แปลงเป็นพิมพ์เล็ก แล้วส่งลง Database ตรงๆ เลย (มี 3 สถานะแล้ว)
    const dbStatus = status.toLowerCase(); // จะได้ 'active', 'suspended', 'banned'

    const db = typeof pool === 'function' ? pool() : pool;

    await db.query(
      `UPDATE users SET u_status = ? WHERE user_id = ?`,
      [dbStatus, userId]
    );

    return NextResponse.json(
      { 
        success: true,
        message: `Updated status to ${status} successfully`, 
        user: { id: userId, status: status } 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Failed to update user status:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}