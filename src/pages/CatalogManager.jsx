import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ListFilter, Plus, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getFirstOrganizationId, getProducts, getCategories, quickUpdateProductStatus, quickUpdateProductCategory } from '../services/catalogService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CatalogManager = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, available, unavailable
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const orgId = await getFirstOrganizationId();
      if (orgId) {
        const [prods, cats] = await Promise.all([
          getProducts(orgId),
          getCategories(orgId)
        ]);
        setProducts(prods);
        setCategories(cats);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const handleStatusChange = async (productId, newStatus) => {
    try {
      await quickUpdateProductStatus(productId, newStatus);
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, status: newStatus === 'available' ? 'Disponible' : 'No disponible' } : p
      ));
    } catch (error) {
      alert("Error al actualizar estado");
    }
  };

  const handleCategoryChange = async (productId, newCategoryId) => {
    try {
      await quickUpdateProductCategory(productId, newCategoryId);
      const cat = categories.find(c => c.id === newCategoryId);
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, categoryId: newCategoryId, category: cat ? cat.name : 'General' } : p
      ));
    } catch (error) {
      alert("Error al actualizar categoría");
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col h-full">
      {/* Header H1 */}
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Artículos</h1>
      </div>

      {/* Action Bar */}
      <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              className="pl-9 w-full sm:w-64 rounded-full border-gray-300" 
              placeholder="Buscar" 
            />
          </div>
          <Button variant="outline" className="rounded-full font-normal hidden sm:flex">
            Categoría
          </Button>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-full border-gray-200">
              <span className="font-normal text-gray-500 mr-1">Estado:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="available">Activo</SelectItem>
              <SelectItem value="unavailable">Inactivo</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" className="rounded-full font-normal hidden sm:flex">
            <ListFilter className="h-4 w-4 mr-2" /> Todos los filtros
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-full">
            Acciones <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
          <Button className="rounded-full bg-black text-white hover:bg-gray-800" asChild>
            <Link to="/products/new">
              Crear artículo
            </Link>
          </Button>
        </div>
      </div>

      {/* Table Section */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-white border-b text-gray-500 font-medium sticky top-0 z-10">
            <tr>
              <th className="px-6 py-3 w-10">
                <input type="checkbox" className="rounded border-gray-300" />
              </th>
              <th className="px-6 py-3 font-medium">Artículo</th>
              <th className="px-6 py-3 font-medium">Categoría de informes</th>
              <th className="px-6 py-3 font-medium text-center">Estado</th>
              <th className="px-6 py-3 font-medium text-right">Precio (Neto / Final)</th>
              <th className="px-6 py-3 w-10 text-center">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 rounded-full hover:bg-gray-100">
                  <Plus className="h-4 w-4" />
                </Button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {/* Creacion Rapida Row */}
            <tr className="hover:bg-gray-50 group">
              <td className="px-6 py-3" colSpan={6}>
                <button className="flex items-center text-sm font-semibold hover:underline">
                  <Plus className="h-4 w-4 mr-2" /> Creación rápida
                </button>
              </td>
            </tr>

            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  Cargando artículos...
                </td>
              </tr>
            ) : products.filter(p => statusFilter === 'all' || (statusFilter === 'available' ? p.status === 'Disponible' : p.status === 'No disponible')).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron artículos con ese filtro.
                </td>
              </tr>
            ) : (
              products.filter(p => statusFilter === 'all' || (statusFilter === 'available' ? p.status === 'Disponible' : p.status === 'No disponible')).map((product) => (
                <tr 
                  key={product.id}
                  className="hover:bg-gray-50 group transition-colors"
                >
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded overflow-hidden bg-gray-100 bg-cover bg-center shrink-0 border flex items-center justify-center text-gray-400"
                        style={product.image ? { backgroundImage: `url(${product.image})` } : {}}
                      >
                        {!product.image && <span className="text-xs">Sin foto</span>}
                      </div>
                      <span className="font-medium text-gray-900">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <Select 
                      value={product.categoryId} 
                      onValueChange={(val) => handleCategoryChange(product.id, val)}
                    >
                      <SelectTrigger className="h-8 border-transparent hover:border-gray-200 bg-transparent hover:bg-white w-[140px] shadow-none">
                        <SelectValue>{product.category}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">General</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Select 
                      value={product.status === 'Disponible' ? 'available' : 'unavailable'} 
                      onValueChange={(val) => handleStatusChange(product.id, val)}
                    >
                      <SelectTrigger className={`h-8 border-0 shadow-none w-[130px] mx-auto rounded-full font-medium ${
                        product.status === 'Disponible' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Disponible</SelectItem>
                        <SelectItem value="unavailable">No disponible</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-semibold text-gray-900">${Math.round(product.price * 1.19).toLocaleString('es-CL')}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">Neto: ${product.price?.toLocaleString('es-CL')}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-50 transition-colors shadow-sm active:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/products/${product.id}`);
                        }}
                      >
                        Editar
                      </button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CatalogManager;
