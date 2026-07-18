import React, { useState, useEffect } from 'react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ListFilter, Plus, MoreHorizontal, Sparkles, Trash2, FolderInput, CheckCircle, XCircle, Tag } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getFirstOrganizationId, getProducts, getCategories, quickUpdateProductStatus, quickUpdateProductCategory, deleteProduct, bulkDeleteProducts, duplicateProduct, bulkUpdateProductCategory, bulkUpdateProductStatus } from '../services/catalogService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ActionMenu from '../components/ui/ActionMenu';
import AIImportModal from '../components/catalog/AIImportModal';
import ConfirmDeleteModal from '../components/ui/ConfirmDeleteModal';
import BulkActionMenu from '../components/ui/BulkActionMenu';
import Modal from '../components/ui/Modal';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';

const CatalogManager = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, available, unavailable
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
  const [assignCategoryModal, setAssignCategoryModal] = useState({ isOpen: false, selectedCategory: 'none', isUpdating: false });
  const [isTypeSelectionModalOpen, setIsTypeSelectionModalOpen] = useState(false);
  const navigate = useNavigate();

  const toggleCategory = (catName) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [catName]: !prev[catName]
    }));
  };

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const orgId = await getFirstOrganizationId();
    if (orgId) {
      const [prods, cats] = await Promise.all([
        getProducts(orgId),
        getCategories(orgId)
      ]);
      setProducts(prods);
      setCategories(cats);
    }
    if (showLoading) setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (productId, newStatus) => {
    try {
      const isAvailable = newStatus === 'available';
      await quickUpdateProductStatus(productId, isAvailable);
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, status: isAvailable ? 'available' : 'unavailable' } : p
      ));
    } catch (error) {
      alert("Error al actualizar estado");
    }
  };

  const handleCategoryChange = async (productId, categoryId) => {
    try {
      await quickUpdateProductCategory(productId, categoryId === 'none' ? null : categoryId);
      loadData(false);
    } catch (error) {
      alert("Error al actualizar categoría");
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleToggleSelectAll = (e, currentProducts) => {
    if (e.target.checked) {
      setSelectedIds(currentProducts.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteModal(prev => ({ ...prev, isDeleting: true }));
    try {
      if (deleteModal.mode === 'single') {
        await deleteProduct(deleteModal.targetId);
        toast.success("Artículo eliminado");
      } else {
        await bulkDeleteProducts(selectedIds);
        toast.success(`${selectedIds.length} artículos eliminados`);
        setSelectedIds([]);
      }
      loadData(false);
    } catch (err) {
      toast.error("Error al eliminar");
    } finally {
      setDeleteModal({ isOpen: false, mode: 'single', targetId: null, isDeleting: false });
    }
  };

  const handleDuplicate = async (id) => {
    try {
      await duplicateProduct(id);
      toast.success("Artículo duplicado con éxito");
      loadData(false);
    } catch (err) {
      toast.error("Error al duplicar artículo");
    }
  };

  const handleBulkStatusChange = async (status) => {
    try {
      await bulkUpdateProductStatus(selectedIds, status);
      toast.success(`Se actualizaron ${selectedIds.length} productos`);
      setSelectedIds([]);
      loadData(false);
    } catch (error) {
      toast.error("Error al actualizar estados");
    }
  };

  const handleBulkAssignCategory = async () => {
    setAssignCategoryModal(prev => ({ ...prev, isUpdating: true }));
    try {
      const catId = assignCategoryModal.selectedCategory === 'none' ? null : assignCategoryModal.selectedCategory;
      await bulkUpdateProductCategory(selectedIds, catId);
      toast.success(`Categoría asignada a ${selectedIds.length} artículos`);
      setSelectedIds([]);
      loadData(false);
    } catch (err) {
      toast.error("Error al asignar categoría");
    } finally {
      setAssignCategoryModal({ isOpen: false, selectedCategory: 'none', isUpdating: false });
    }
  };

  useDocumentTitle('Artículos');


  return (
    <div className="flex-1 overflow-auto bg-gray-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader 
          title="Artículos"
          subtitle="Administra la lista de comida, bebidas y adiciones de tu local."
        />

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Action Bar */}
        {selectedIds.length > 0 ? (
          <div className="px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-b bg-blue-50/50">
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none font-medium text-sm px-3 py-1">
                {selectedIds.length} seleccionados
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <BulkActionMenu 
                actions={[
                  { label: "Asignar a categoría", icon: <FolderInput className="h-4 w-4" />, onClick: () => setAssignCategoryModal({ isOpen: true, selectedCategory: 'none', isUpdating: false }) },
                  { label: "Activar", icon: <CheckCircle className="h-4 w-4" />, onClick: () => handleBulkStatusChange('available') },
                  { label: "Desactivar", icon: <XCircle className="h-4 w-4" />, onClick: () => handleBulkStatusChange('unavailable') },
                  { label: "Eliminar", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleteModal({ isOpen: true, mode: 'bulk', targetId: null, isDeleting: false }), destructive: true },
                ]}
              />
            </div>
          </div>
        ) : (
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
            <Button variant="outline" className="rounded-full text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setIsAIModalOpen(true)}>
              <Sparkles className="h-4 w-4 mr-2" /> Importar menú
            </Button>
            <Button variant="outline" className="rounded-full">
              Acciones <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
            <Button className="rounded-full bg-black text-white hover:bg-gray-800" onClick={() => setIsTypeSelectionModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nuevo artículo
            </Button>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider border-b border-gray-150 sticky top-0 z-10">
              <th className="px-6 py-4 w-10">
                <input 
                  type="checkbox" 
                  className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                  checked={products.length > 0 && selectedIds.length === products.length}
                  onChange={(e) => handleToggleSelectAll(e, products)}
                />
              </th>
              <th className="px-6 py-4 font-bold">Artículo</th>
              <th className="px-6 py-4 font-bold">Categoría de informes</th>
              <th className="px-6 py-4 font-bold text-center">Estado</th>
              <th className="px-6 py-4 font-bold text-right">Precio (Neto / Final)</th>
              <th className="px-6 py-4 w-10 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  Cargando artículos...
                </td>
              </tr>
            ) : (() => {
              const filteredProducts = products.filter(p => statusFilter === 'all' || (statusFilter === 'available' ? p.status === 'Disponible' : p.status === 'No disponible'));
              
              if (filteredProducts.length === 0) {
                return (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      No se encontraron artículos con ese filtro.
                    </td>
                  </tr>
                );
              }

              const groupedProducts = filteredProducts.reduce((acc, product) => {
                const cat = product.category || 'General';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(product);
                return acc;
              }, {});

              // Sort categories alphabetically, maybe keep 'General' at the end
              const sortedCategories = Object.keys(groupedProducts).sort((a, b) => {
                if (a === 'General') return 1;
                if (b === 'General') return -1;
                return a.localeCompare(b);
              });

              return sortedCategories.map(catName => {
                const isCollapsed = collapsedCategories[catName];
                const prods = groupedProducts[catName];
                
                return (
                  <React.Fragment key={catName}>
                    <tr 
                      className="bg-gray-100/80 hover:bg-gray-100 cursor-pointer border-t border-b border-gray-200 select-none" 
                      onClick={() => toggleCategory(catName)}
                    >
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                          checked={prods.every(p => selectedIds.includes(p.id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const prodIds = prods.map(p => p.id);
                              setSelectedIds(prev => Array.from(new Set([...prev, ...prodIds])));
                            } else {
                              const prodIds = prods.map(p => p.id);
                              setSelectedIds(prev => prev.filter(id => !prodIds.includes(id)));
                            }
                          }}
                        />
                      </td>
                      <td colSpan={6} className="px-2 py-4 font-semibold text-gray-850">
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                          {catName} <span className="text-gray-500 text-sm font-normal">({prods.length})</span>
                        </div>
                      </td>
                    </tr>
                    {!isCollapsed && prods.map((product) => (
                      <tr 
                        key={product.id}
                        className="hover:bg-gray-50 group transition-colors"
                      >
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" 
                            className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                            checked={selectedIds.includes(product.id)}
                            onChange={() => handleToggleSelect(product.id)}
                          />
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
                          <div className="flex justify-center items-center">
                            <Switch 
                              checked={product.status === 'Disponible'} 
                              onCheckedChange={(checked) => handleStatusChange(product.id, checked ? 'available' : 'unavailable')}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="font-semibold text-gray-900">${Math.round(product.price * 1.19).toLocaleString('es-CL')}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">Neto: ${product.price?.toLocaleString('es-CL')}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-50 transition-colors active:bg-gray-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/products/${product.id}`);
                              }}
                            >
                              Editar
                            </button>
                            <ActionMenu 
                              onDelete={() => setDeleteModal({ isOpen: true, mode: 'single', targetId: product.id, isDeleting: false })}
                              onDuplicate={() => handleDuplicate(product.id)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
      </div>
      <AIImportModal 
        isOpen={isAIModalOpen} 
        onClose={() => setIsAIModalOpen(false)} 
        onSuccess={loadData} 
      />
      <ConfirmDeleteModal 
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteModal.isDeleting}
        title={deleteModal.mode === 'single' ? "Eliminar artículo" : "Eliminar artículos"}
        description={deleteModal.mode === 'single' 
          ? "¿Estás seguro de que deseas eliminar este artículo? Esta acción no se puede deshacer."
          : `¿Estás seguro de que deseas eliminar los ${selectedIds.length} artículos seleccionados? Esta acción no se puede deshacer.`
        }
      />
      <Modal 
        isOpen={assignCategoryModal.isOpen} 
        onClose={() => setAssignCategoryModal(prev => ({ ...prev, isOpen: false }))} 
        title="Asignar a categoría"
      >
        <div className="p-6">
          <p className="text-gray-600 mb-4 text-sm">Selecciona la categoría a la que deseas mover los {selectedIds.length} artículos seleccionados.</p>
          <Select 
            value={assignCategoryModal.selectedCategory} 
            onValueChange={(val) => setAssignCategoryModal(prev => ({ ...prev, selectedCategory: val }))}
          >
            <SelectTrigger className="w-full h-11 rounded-xl">
              <SelectValue placeholder="Seleccionar categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">General (Sin categoría)</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <Button variant="outline" className="rounded-full" onClick={() => setAssignCategoryModal(prev => ({ ...prev, isOpen: false }))}>
            Cancelar
          </Button>
          <Button className="rounded-full bg-black text-white hover:bg-gray-800" onClick={handleBulkAssignCategory} disabled={assignCategoryModal.isUpdating}>
            {assignCategoryModal.isUpdating ? "Asignando..." : "Asignar"}
          </Button>
        </div>
      </Modal>

      {/* Modal de Selección del Tipo de Producto */}
      <Modal
        isOpen={isTypeSelectionModalOpen}
        onClose={() => setIsTypeSelectionModalOpen(false)}
        title="Crear nuevo artículo"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">Selecciona el tipo de artículo que deseas registrar en el catálogo:</p>
          
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => {
                setIsTypeSelectionModalOpen(false);
                navigate('/products/new?type=physical');
              }}
              className="flex items-start text-left p-4 border border-gray-200 rounded-2xl hover:border-black hover:bg-gray-50 transition-all gap-4 w-full cursor-pointer"
            >
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <Tag className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-gray-900">Producto Único</h4>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Registra un plato, bebida o servicio individual con variantes, ingredientes extra y control de inventario.</p>
              </div>
            </button>

            <button
              onClick={() => {
                setIsTypeSelectionModalOpen(false);
                navigate('/products/new?type=bundle');
              }}
              className="flex items-start text-left p-4 border border-gray-200 rounded-2xl hover:border-black hover:bg-gray-50 transition-all gap-4 w-full cursor-pointer"
            >
              <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-gray-900">Producto Múltiple (Combo)</h4>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">Crea una promoción, paquete o combo que contenga otros productos en su interior (ej: Pizza + Bebida).</p>
              </div>
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
};

export default CatalogManager;
