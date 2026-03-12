import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db/mysql"; 

export async function GET(request: NextRequest) {
  try {
    const db = typeof pool === 'function' ? pool() : pool;
    const [users]: any = await db.query(
      `SELECT 
         user_id AS id, 
         username, 
         name AS f_name, 
         surname AS l_name, 
         email, 
         roles AS role, 
         u_status AS status, 
         created_at 
       FROM users 
       WHERE UPPER(roles) != 'ADMIN' 
       ORDER BY created_at DESC`
    );

    // ⭐️ ดึงคำจาก Database มาแปลงเป็นพิมพ์ใหญ่ให้เว็บแสดงผล
    const formattedUsers = users.map((user: any) => {
      const dbStatus = String(user.status || 'active').toLowerCase();
      let finalStatus = 'ACTIVE';

      if (dbStatus === 'suspended') {
        finalStatus = 'SUSPENDED';
      } else if (dbStatus === 'banned') {
        finalStatus = 'BANNED';
      }

      return {
        ...user,
        status: finalStatus
      };
    });

    return NextResponse.json({ users: formattedUsers }, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}