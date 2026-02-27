# การจัดเก็บข้อมูลผู้ใช้จริงๆ (User Data Storage Guide)

## แนะนำวิธีจัดเก็บข้อมูลผู้ใช้ (Recommended User Storage Options)

### 1. PostgreSQL + Prisma (แนะนำ)

**ข้อดี:**
- ฐานข้อมูล relational ที่เสถียรและนิยมใช้
- Prisma ORM ทำให้เขียน query ง่าย
- รองรับ transaction, migration และ type safety
- ฟรีบน Supabase, Railway, Neon

**การติดตั้ง:**
```bash
npm install prisma @prisma/client bcryptjs jsonwebtoken
npm install -D prisma
```

**ตั้งค่า Prisma:**
```bash
npx prisma init
npx prisma migrate dev --name init
```

**Schema (prisma/schema.prisma):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  email     String   @unique
  password  String
  role      String   @default("user")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**วิธีใช้งาน:**
```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Register
const hashedPassword = await bcrypt.hash(password, 10);
const user = await prisma.user.create({
  data: { username, email, password: hashedPassword }
});

// Login
const user = await prisma.user.findUnique({ where: { username } });
const isValid = await bcrypt.compare(password, user.password);
```

---

### 2. MongoDB + Mongoose

**ข้อดี:**
- NoSQL database ยืดหยุ่นสูง
- Schema-less สามารถเพิ่ม field ได้ง่าย
- ฟรีบน MongoDB Atlas

**การติดตั้ง:**
```bash
npm install mongoose bcryptjs
```

**Schema (models/User.ts):**
```typescript
import mongoose, { Schema, Document } from 'mongoose';

interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  role: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
```

---

### 3. Supabase (แนะนำสำหรับระบบ Authentication)

**ข้อดี:**
- มี Auth พร้อมใช้ (OAuth, Email/Password)
- Database (PostgreSQL) ฟรี
- Real-time subscriptions
- Storage สำหรับไฟล์รูปภาพ

**การติดตั้ง:**
```bash
npm install @supabase/supabase-js
```

**วิธีใช้งาน:**
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Register
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { username }
  }
});

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: username,
  password,
});

// Save user data to custom table
const { error } = await supabase
  .from('users')
  .insert({ id: data.user.id, username, email });
```

---

### 4. Firebase Authentication

**ข้อดี:**
- Authentication พร้อมใช้
- รองรับ Social Login (Google, Facebook, GitHub)
- Real-time Database และ Firestore
- Hosting ฟรี

**การติดตั้ง:**
```bash
npm install firebase
```

**วิธีใช้งาน:**
```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);

// Register
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
await updateProfile(userCredential.user, { displayName: username });

// Login
const userCredential = await signInWithEmailAndPassword(auth, email, password);
```

---

### 5. Cloud Service ฟรีที่แนะนำ

| Service | Database | Auth | Storage | Pricing |
|---------|-----------|-------|---------|---------|
| **Supabase** | PostgreSQL (500MB) | ✅ | 1GB | ฟรี |
| **Neon** | PostgreSQL (0.5GB) | ❌ | - | ฟรี |
| **PlanetScale** | MySQL (5GB) | ❌ | - | ฟรี |
| **MongoDB Atlas** | MongoDB (512MB) | ❌ | - | ฟรี |
| **Firebase** | Firestore (1GB) | ✅ | 5GB | ฟรี |

---

## การรักษาความปลอดภัย (Security Best Practices)

### 1. Password Hashing
ใช้ bcrypt หรือ argon2 สำหรับ hashing:
```typescript
import bcrypt from 'bcryptjs';

// Hash password
const hashedPassword = await bcrypt.hash(password, 10);

// Compare password
const isValid = await bcrypt.compare(password, hashedPassword);
```

### 2. JWT Token
สร้าง token สำหรับ session:
```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET!,
  { expiresIn: '7d' }
);
```

### 3. Environment Variables
อย่าเก็บ secret ใน code:
```bash
# .env.local
DATABASE_URL="postgresql://..."
JWT_SECRET="your-secret-key-here"
NEXT_PUBLIC_SUPABASE_URL="https://..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

### 4. CORS Protection
ตั้งค่า CORS ใน API routes:
```typescript
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

---

## โครงสร้าง API Routes ที่แนะนำ

```
src/app/api/
├── auth/
│   ├── login/
│   │   └── route.ts      # POST /api/auth/login
│   ├── register/
│   │   └── route.ts      # POST /api/auth/register
│   ├── logout/
│   │   └── route.ts      # POST /api/auth/logout
│   └── me/
│       └── route.ts      # GET  /api/auth/me (get current user)
├── users/
│   ├── [id]/
│   │   └── route.ts      # GET/PUT/DELETE /api/users/:id
│   └── route.ts          # GET all users (admin)
└── parking/
    ├── spots/
    │   └── route.ts      # GET available parking spots
    ├── reserve/
    │   └── route.ts      # POST reserve parking spot
    └── history/
        └── route.ts      # GET parking history
```

---

## ถัดไป (Next Steps)

1. เลือก database ที่ต้องการใช้
2. ติดตั้ง dependencies ที่เกี่ยวข้อง
3. สร้าง `.env.local` และตั้งค่า connection string
4. แก้ไข API routes ให้เชื่อมต่อกับ database จริง
5. เพิ่ม validation และ error handling
6. ทดสอบระบบ login/register
