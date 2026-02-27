import { NextRequest, NextResponse } from 'next/server';

// TODO: Replace with your actual registration logic
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, email, password, confirmPassword } = body;

    // Validation
    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // ===== OPTION 1: Database with Prisma =====
    // import { PrismaClient } from '@prisma/client';
    // import bcrypt from 'bcryptjs';
    // const prisma = new PrismaClient();

    // Check if user exists
    // const existingUser = await prisma.user.findFirst({
    //   where: {
    //     OR: [{ username }, { email }]
    //   }
    // });
    // if (existingUser) {
    //   return NextResponse.json(
    //     { error: 'Username or email already exists' },
    //     { status: 409 }
    //   );
    // }

    // Hash password
    // const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    // const newUser = await prisma.user.create({
    //   data: {
    //     username,
    //     email,
    //     password: hashedPassword,
    //     role: 'user',
    //     createdAt: new Date(),
    //   }
    // });

    // ===== OPTION 2: PostgreSQL with pg =====
    // import bcrypt from 'bcryptjs';
    // const hashedPassword = await bcrypt.hash(password, 10);
    // const result = await pool.query(
    //   'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email',
    //   [username, email, hashedPassword, 'user']
    // );

    // ===== OPTION 3: MongoDB with Mongoose =====
    // import bcrypt from 'bcryptjs';
    // import User from '@/models/User';
    // const hashedPassword = await bcrypt.hash(password, 10);
    // const newUser = await User.create({
    //   username,
    //   email,
    //   password: hashedPassword,
    //   role: 'user',
    // });

    // ===== OPTION 4: Supabase =====
    // const { data, error } = await supabase.auth.signUp({
    //   email,
    //   password,
    //   options: {
    //     data: { username }
    //   }
    // });

    // ===== OPTION 5: Firebase Auth =====
    // const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // await updateProfile(userCredential.user, { displayName: username });

    // ===== DEMO: Mock registration =====
    const mockUser = {
      id: 'user_' + Date.now(),
      username,
      email,
      role: 'user',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      user: mockUser,
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
