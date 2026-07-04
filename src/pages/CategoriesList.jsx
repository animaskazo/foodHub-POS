import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ListFilter, Plus, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getFirstOrganizationId, getCategories, quickUpdateCategoryStatus } from '../services/catalogService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CategoriesList = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  const navigate = useNavigate();

  useEffect(() => {
    const loadCategories = async () => {
      setLoading(true);
      const orgId = await getFirstOrganizationId();
      if (orgId) {
        const data = await getCategories(orgId);
        setCategories(data);
      }
      setLoading(false);
    };
    loadCategories();
  }, []);

  const handleStatusChange = async (categoryId, newStatus) => {
    try {
      const isActive = newStatus === 'active';
      await quickUpdateCategoryStatus(categoryId, isActive);
      setCategories(prev => prev.map(c => 
        c.id === categoryId ? { ...c, is_active: isActive } : c
      ));
    } catch (error) {
      alert("Error al actualizar estado");
    }
  };

  return (
    <div className="flex-1 bg-white flex flex-col h-full">
      {/* Header H1 */}
      <div className="px-6 pt-6 pb-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Categorías</h1>
      </div>

      {/* Action Bar */}
      <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              className="pl-9 w-full sm:w-64 rounded-full border-gray-300" 
              placeholder="Buscar categoría" 
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-full border-gray-200">
              <span className="font-normal text-gray-500 mr-1">Estado:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="inactive">Inactivo</SelectItem>
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
            <Link to="/categories/new">
              Crear categoría
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
              <th className="px-6 py-3 font-medium">Categoría</th>
              <th className="px-6 py-3 font-medium">Artículos asignados</th>
              <th className="px-6 py-3 font-medium text-center">Estado</th>
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
              <td className="px-6 py-3" colSpan={5}>
                <button className="flex items-center text-sm font-semibold hover:underline">
                  <Plus className="h-4 w-4 mr-2" /> Creación rápida
                </button>
              </td>
            </tr>

            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Cargando categorías...
                </td>
              </tr>
            ) : categories.filter(c => statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active)).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No se encontraron categorías con ese filtro.
                </td>
              </tr>
            ) : (
              categories.filter(c => statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active)).map((category) => (
                <tr 
                  key={category.id}
                  className="hover:bg-gray-50 group transition-colors"
                >
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {category.name}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900">{category.product_count}</span>
                      <span>{category.product_count === 1 ? 'artículo' : 'artículos'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Select 
                      value={category.is_active ? 'active' : 'inactive'} 
                      onValueChange={(val) => handleStatusChange(category.id, val)}
                    >
                      <SelectTrigger className={`h-8 border-0 shadow-none w-[110px] mx-auto rounded-full font-medium ${
                        category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="inactive">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-50 transition-colors shadow-sm active:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/categories/${category.id}`);
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

export default CategoriesList;
