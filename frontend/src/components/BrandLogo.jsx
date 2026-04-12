import React from 'react';

export default function BrandLogo({ size = 56, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="Yair Vahaba Logo"
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        display: 'block'
      }}
    />
  );
}
