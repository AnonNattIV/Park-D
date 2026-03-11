import { NextRequest, NextResponse } from 'next/server';
import getPool from '@/lib/db/mysql';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { b_id, rating, comment } = body;

    if (!b_id || !rating) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });
    }

    const pool = getPool();

    // 1. เช็คว่าเคยรีวิวไปหรือยัง
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT review_id FROM reviews WHERE b_id = ?',
      [b_id]
    );

    if (existing.length > 0) {
      // ถ้ารีวิวแล้ว ให้อัปเดตข้อมูลเดิมเสมอ (ไม่จำกัดเวลา)
      await pool.query(
        `UPDATE reviews SET score = ?, comment = ? WHERE b_id = ?`,
        [rating, comment || null, b_id]
      );
      return NextResponse.json({ success: true, message: 'แก้ไขรีวิวสำเร็จ' }, { status: 200 });
    }

    // 2. ถ้ายังไม่เคยรีวิว ให้สร้างใหม่ (INSERT)
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO reviews (b_id, score, comment, created_at)
       VALUES (?, ?, ?, NOW())`,
      [b_id, rating, comment || null]
    );

    return NextResponse.json({ success: true, review_id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error('Review Error:', error);
    return NextResponse.json({ error: 'เซิร์ฟเวอร์เกิดข้อผิดพลาด' }, { status: 500 });
  }
}