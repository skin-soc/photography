'use client'

import { useState } from 'react';
import Image from 'next/image';

interface Size {
  size: string;
  price: number;
}

interface Print {
  id: number;
  title: string;
  image: string;
  sizes: Size[];
}

const printsData: Print[] = [
  {
    id: 1,
    title: 'Print 1',
    image: '/images/print1.jpg',
    sizes: [
      { size: '8x10', price: 20 },
      { size: '16x20', price: 40 },
    ],
  },
  {
    id: 2,
    title: 'Print 2',
    image: '/images/print2.jpg',
    sizes: [
      { size: '8x10', price: 25 },
      { size: '16x20', price: 50 },
    ],
  },
];

export default function Prints() {
  const [selectedSize, setSelectedSize] = useState<Record<number, Size>>({});

  const handleSizeChange = (id: number, size: Size) => {
    setSelectedSize({ ...selectedSize, [id]: size });
  };

  const handlePurchase = (id: number) => {
    const selectedPrint = printsData.find(print => print.id === id);
    const size = selectedSize[id];
    if (size && selectedPrint) {
      // Implement payment processing here
      console.log(`Purchasing ${selectedPrint.title} - Size: ${size.size} - Price: $${size.price}`);
    } else {
      alert('Please select a size.');
    }
  };

  return (
    <div className="prints-container">
      <h1>Prints for Sale</h1>
      <div className="prints-grid">
        {printsData.map(print => (
          <div key={print.id} className="print-item">
            <Image
              src={print.image}
              alt={print.title}
              width={500}
              height={300}
              className="w-full h-auto"
            />
            <h2>{print.title}</h2>
            <div>
              {print.sizes.map(size => (
                <div key={size.size}>
                  <input
                    type="radio"
                    name={`size-${print.id}`}
                    value={size.size}
                    onChange={() => handleSizeChange(print.id, size)}
                  />
                  {size.size} - ${size.price}
                </div>
              ))}
            </div>
            <button onClick={() => handlePurchase(print.id)}>Buy Now</button>
          </div>
        ))}
      </div>
    </div>
  );
} 