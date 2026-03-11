'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';

export default function ReviewPage({ params }: { params: { b_id: string } }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingData, setBookingData] = useState<any>(null);

  useEffect(() => {
    const fetchBookingDetails = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/bookings/${params.b_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.booking) {
            setBookingData(data.booking);
            // 💡 ถ้ามีการรีวิวไปแล้ว ให้ดึงมาแสดงเพื่อเตรียมแก้ไข
            if (data.booking.review) {
              setRating(data.booking.review.score);
              setComment(data.booking.review.comment || '');
            }
          }
        }
      } catch (error) {
        console.error('Error fetching booking:', error);
      }
    };
    fetchBookingDetails();
  }, [params.b_id]);

  const handleSubmit = async () => {
    if (rating === 0) return alert('กรุณาเลือกดาวอย่างน้อย 1 ดวง');
    setIsSubmitting(true);

    try {
      // ดึง token ถ้ามีระบบ Login
      const token = localStorage.getItem('token'); 
      
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          b_id: Number(params.b_id),
          lot_id: bookingData?.lot_id,
          user_id: bookingData?.user_id, // หรือเอาจาก session
          rating,
          comment
        })
      });

      if (res.ok) {
        // ข้อ 7: สำเร็จแล้วกลับหน้าหลัก
        router.push('/user/home'); 
      } else {
        const data = await res.json();
        alert(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      alert('ระบบมีปัญหา');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-md border">
      <h2 className="text-2xl font-bold text-center mb-6">รีวิวสถานที่จอดรถ</h2>
      
      {/* ข้อ 3: รูปดาว 1 ถึง 5 */}
      <div className="flex justify-center gap-2 mb-6">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className="focus:outline-none transform transition hover:scale-110"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(rating)}
          >
            <Star
              size={48}
              className={star <= (hover || rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}
            />
          </button>
        ))}
      </div>

      {/* ข้อ 4: ช่องกรอกความคิดเห็น */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">ความคิดเห็น (ไม่บังคับ)</label>
        <textarea
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          rows={4}
          placeholder="สถานที่นี้เป็นอย่างไรบ้าง..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        ></textarea>
      </div>

      {/* ข้อ 5: ปุ่ม ยืนยัน / ยกเลิก */}
      <div className="flex gap-4">
        <button
          onClick={() => router.back()} // ข้อ 6: กดยกเลิกกลับไปหน้า check out
          className="flex-1 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300"
        >
          ยกเลิก
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || rating === 0}
          className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยัน'}
        </button>
      </div>
    </div>
  );
}