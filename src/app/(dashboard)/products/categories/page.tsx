'use client'

import { useState, Fragment } from 'react'
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useSubcategories,
  useCreateSubcategory,
  useUpdateSubcategory,
  useDeleteSubcategory,
} from '@/hooks/useProducts'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Package, AlertCircle, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface CategoryFormData {
  name: string
  description: string
}

interface SubcategoryFormData {
  name: string
  description: string
  category_id: string
}

function SubcategoryRows({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { data: subcategories, isLoading } = useSubcategories(categoryId)
  const createSubcategory = useCreateSubcategory()
  const updateSubcategory = useUpdateSubcategory()
  const deleteSubcategory = useDeleteSubcategory()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<any>(null)
  const [formData, setFormData] = useState<SubcategoryFormData>({
    name: '',
    description: '',
    category_id: categoryId,
  })

  const handleOpenDialog = (sub?: any) => {
    if (sub) {
      setEditingSub(sub)
      setFormData({
        name: sub.name,
        description: sub.description || '',
        category_id: categoryId,
      })
    } else {
      setEditingSub(null)
      setFormData({ name: '', description: '', category_id: categoryId })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingSub(null)
    setFormData({ name: '', description: '', category_id: categoryId })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      toast.error('Subcategory name is required')
      return
    }

    try {
      if (editingSub) {
        await updateSubcategory.mutateAsync({
          id: editingSub.id,
          updates: {
            name: formData.name.trim(),
            description: formData.description.trim() || null,
          },
        })
        toast.success('Subcategory updated successfully')
      } else {
        await createSubcategory.mutateAsync({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          category_id: categoryId,
          is_active: true,
        })
        toast.success('Subcategory created successfully')
      }
      handleCloseDialog()
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the subcategory "${name}"?`)) return
    try {
      await deleteSubcategory.mutateAsync(id)
      toast.success('Subcategory deleted successfully')
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const isSubmitting = createSubcategory.isPending || updateSubcategory.isPending

  return (
    <>
      {/* Add subcategory row */}
      <TableRow className="bg-muted/30 hover:bg-muted/50">
        <TableCell colSpan={2} className="pl-12">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => handleOpenDialog()}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Subcategory
          </Button>
        </TableCell>
        <TableCell />
        <TableCell />
      </TableRow>

      {isLoading ? (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={4} className="pl-12 text-sm text-muted-foreground">
            Loading subcategories...
          </TableCell>
        </TableRow>
      ) : subcategories && subcategories.length > 0 ? (
        subcategories.map((sub) => (
          <TableRow key={sub.id} className="bg-muted/30 hover:bg-muted/50">
            <TableCell className="pl-12 text-sm">{sub.name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {sub.description || '—'}
            </TableCell>
            <TableCell>
              <Badge variant={sub.is_active ? 'default' : 'secondary'} className="text-xs">
                {sub.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenDialog(sub)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(sub.id, sub.name)}
                  disabled={deleteSubcategory.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))
      ) : null}

      {/* Subcategory Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingSub ? 'Edit Subcategory' : 'Add Subcategory'}
              </DialogTitle>
              <DialogDescription>
                {editingSub
                  ? `Update the subcategory under "${categoryName}".`
                  : `Add a new subcategory under "${categoryName}".`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sub-name">
                  Subcategory Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sub-name"
                  placeholder="e.g., Portland Cement"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-description">Description</Label>
                <Textarea
                  id="sub-description"
                  placeholder="Optional description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingSub ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function CategoriesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    description: '',
  })

  const { data: categories, isLoading, isError, error, refetch } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const toggleExpand = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleOpenDialog = (category?: any) => {
    if (category) {
      setEditingCategory(category)
      setFormData({
        name: category.name,
        description: category.description || '',
      })
    } else {
      setEditingCategory(null)
      setFormData({
        name: '',
        description: '',
      })
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingCategory(null)
    setFormData({
      name: '',
      description: '',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Category name is required')
      return
    }

    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({
          id: editingCategory.id,
          updates: {
            name: formData.name.trim(),
            description: formData.description.trim() || null,
          },
        })
        toast.success('Category updated successfully')
      } else {
        await createCategory.mutateAsync({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: true,
        })
        toast.success('Category created successfully')
      }
      handleCloseDialog()
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the category "${name}"? This will not delete products in this category.`)) {
      return
    }

    try {
      await deleteCategory.mutateAsync(id)
      toast.success('Category deleted successfully')
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  const isSubmitting = createCategory.isPending || updateCategory.isPending

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Product Categories</h1>
          <p className="text-muted-foreground">
            Manage product categories and subcategories ({categories?.length || 0} categories)
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {/* Categories table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-muted-foreground">Loading categories...</div>
            </div>
          ) : isError ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-muted-foreground">
                Failed to load categories: {error?.message || 'Unknown error'}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : categories && categories.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2">
              <Package className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No categories found</p>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Category
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories?.map((category) => {
                  const isExpanded = expandedCategories.has(category.id)
                  return (
                    <Fragment key={category.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggleExpand(category.id)}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            {category.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {category.description || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={category.is_active ? 'default' : 'secondary'}>
                            {category.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(category)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(category.id, category.name)}
                              disabled={deleteCategory.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <SubcategoryRows
                          categoryId={category.id}
                          categoryName={category.name}
                        />
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Category Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'Edit Category' : 'Create New Category'}
              </DialogTitle>
              <DialogDescription>
                {editingCategory
                  ? 'Update the category information below.'
                  : 'Add a new product category to organize your inventory.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Category Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Cement & Concrete"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description for this category"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? 'Saving...'
                  : editingCategory
                  ? 'Update Category'
                  : 'Create Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
