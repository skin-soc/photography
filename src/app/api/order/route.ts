import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const data = await request.json();
  // Either use the data variable or remove it if not needed
  console.log('Received order:', data); // Example usage
  // Process the order and payment here
  return NextResponse.json({ message: 'Order processed successfully!' });
} 