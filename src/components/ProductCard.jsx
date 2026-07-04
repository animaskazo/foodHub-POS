import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ProductCard = ({ product }) => {
  return (
    <Card className="h-full flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg overflow-hidden border">
      <div 
        className="h-36 bg-gray-100 flex items-center justify-center border-b bg-cover bg-center"
        style={{ backgroundImage: product.image ? `url(${product.image})` : 'none' }}
      >
        {!product.image && (
          <span className="text-sm text-gray-500">Sin Imagen</span>
        )}
      </div>
      <CardContent className="flex-grow flex flex-col p-4">
        <h3 className="font-semibold text-lg leading-tight mb-2">
          {product.name || 'Nombre del Producto'}
        </h3>
        <p className="text-sm text-gray-500 flex-grow mb-4 line-clamp-3">
          {product.description || 'Descripción del producto...'}
        </p>
        <div className="flex justify-between items-center mt-auto">
          <span className="font-bold text-lg">
            ${product.price || '0'}
          </span>
          {product.category && (
            <Badge variant="outline">{product.category}</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductCard;
