import { useState, useEffect, useCallback, useRef } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Shopster Admin"

// TypeScript interfaces based on Shopster API models
interface Customer {
  id: string
  email?: string
  first_name?: string
  last_name?: string
  orders_count: number
  total_spent?: string
  phone?: string
  state: 'enabled' | 'disabled'
  addresses?: Address[]
  default_address?: Address
}

interface Address {
  id: string
  customer_id?: string
  first_name?: string
  last_name?: string
  address1: string
  address2?: string
  city: string
  province?: string
  country: string
  zip?: string
  phone?: string
  default: boolean
}

interface Product {
  id: string
  title: string
  body_html?: string
  vendor: string
  product_type?: string
  status: 'active' | 'draft' | 'archived'
  variants: ProductVariant[]
  images?: ProductImage[]
  tags?: string
}

interface ProductVariant {
  id: string
  product_id: string
  title: string
  price: string
  sku?: string
  inventory_quantity: number
  compare_at_price?: string
}

interface ProductImage {
  id: string
  src: string
  alt?: string
}

interface Transaction {
  id: string
  order_id: string
  kind: string
  gateway: string
  status: string
  message?: string
  created_at: string
  test: boolean
  authorization?: string
  amount: string
  currency: string
  processed_at?: string
  parent_id?: string
}

interface Order {
  id: string
  name: string
  order_number: number
  email?: string
  created_at: string
  financial_status: string
  fulfillment_status?: string
  total_price: string
  line_items: LineItem[]
  customer?: OrderCustomer
  status?: string
  cancelled_at?: string | null
  closed_at?: string | null
  transactions?: Transaction[]
  shipping_address?: any
}

interface LineItem {
  id: string
  title: string
  quantity: number
  price: string
  variant_id?: string
  product_id?: string
  fulfillment_line_item_id?: string
}

interface OrderCustomer {
  id: string
  email?: string
  first_name?: string
  last_name?: string
}

interface DraftOrder {
  id: string
  name?: string
  email?: string
  status: string
  created_at: string
  total_price: string
  line_items: DraftLineItem[]
  customer?: DraftOrderCustomer
}

interface DraftLineItem {
  id?: string
  title: string
  quantity: number
  price: string
  variant_id?: string
  product_id?: string
}

interface DraftOrderCustomer {
  id?: string
  email?: string
  first_name?: string
  last_name?: string
}

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
}

interface Collection {
  id: string
  title: string
  body_html?: string
  handle?: string
  sort_order?: string
  published_scope?: string
  collection_type?: string
  products?: string[]
}

interface DiscountCode {
  id: string
  title: string
  value: string
  value_type: 'fixed_amount' | 'percentage'
  description?: string
}

type View = 'customers' | 'products' | 'orders' | 'drafts' | 'discounts' | 'collections'

// Strip the 'name' field from billing_address and shipping_address on order objects.
// The backend Pydantic schema (OrderAddress) uses extra='forbid' and does not include 'name',
// so databases that have this field cause a ValidationError.
function stripAddressName(order: any): any {
  if (!order || typeof order !== 'object') return order
  const result = { ...order }
  if (result.billing_address && typeof result.billing_address === 'object') {
    const { name: _b, ...rest } = result.billing_address
    result.billing_address = rest
  }
  if (result.shipping_address && typeof result.shipping_address === 'object') {
    const { name: _s, ...rest } = result.shipping_address
    result.shipping_address = rest
  }
  return result
}

export default function ShopsterApp({ setRefreshHandler }: AppProps) {
  const [currentView, setCurrentView] = useState<View>('customers')
  const [contentLoading, setContentLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track which views have been loaded at least once, so tab switches can
  // skip refetches when we already have the data cached locally.
  const [loadedViews, setLoadedViews] = useState<Record<View, boolean>>({
    customers: false,
    products: false,
    orders: false,
    drafts: false,
    discounts: true, // discounts are local-only state
    collections: false,
  })

  // Data states
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [draftOrders, setDraftOrders] = useState<DraftOrder[]>([])

  // Discount and collection states
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null)
  const [collectionProducts, setCollectionProducts] = useState<Product[]>([])
  const [showNewDiscountModal, setShowNewDiscountModal] = useState(false)
  const [selectedDiscount, setSelectedDiscount] = useState<DiscountCode | null>(null)

  // Detail views
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<DraftOrder | null>(null)
  const [ordersCount, setOrdersCount] = useState<number | null>(null)
  const [customerOrders, setCustomerOrders] = useState<Order[]>([])
  // True while an item's full details are being fetched (after click in the
  // sidebar list). Drives a spinner overlay on the detail panel.
  const [detailLoading, setDetailLoading] = useState(false)

  // Modal states
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [showNewDraftModal, setShowNewDraftModal] = useState(false)
  const [showAddAddressModal, setShowAddAddressModal] = useState(false)
  const [showEditAddressModal, setShowEditAddressModal] = useState(false)
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [selectedOrderProduct, setSelectedOrderProduct] = useState<Product | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [orderDetailsError, setOrderDetailsError] = useState<string | null>(null)
  const [showOrderErrorDetails, setShowOrderErrorDetails] = useState(false)
  const [showEditDraftModal, setShowEditDraftModal] = useState(false)
  const [editingDraft, setEditingDraft] = useState<DraftOrder | null>(null)
  const [editDraftProduct, setEditDraftProduct] = useState<Product | null>(null)
  const [editDraftProductId, setEditDraftProductId] = useState<string>('')
  const [editDraftVariantId, setEditDraftVariantId] = useState<string>('')

  // Return/Exchange modal states
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [showExchangeModal, setShowExchangeModal] = useState(false)
  const [exchangeSelectedProductId, setExchangeSelectedProductId] = useState('')

  // Pending order modification modal states
  const [showModifyAddressModal, setShowModifyAddressModal] = useState(false)
  const [showModifyItemsModal, setShowModifyItemsModal] = useState(false)
  const [showModifyPaymentModal, setShowModifyPaymentModal] = useState(false)

  // Transfer to human modal
  const [showTransferModal, setShowTransferModal] = useState(false)

  // Address lookup modal
  const [showAddressLookupModal, setShowAddressLookupModal] = useState(false)
  const [addressLookupCustomerId, setAddressLookupCustomerId] = useState('')
  const [addressLookupAddressId, setAddressLookupAddressId] = useState('')
  const [addressLookupResult, setAddressLookupResult] = useState<Address | Address[] | null>(null)

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('')

  const loadDataRef = useRef<() => void>(() => { })
  const registeredRef = useRef(false)
  const api = useBackendAPI('shopster')

  const refreshApp = useCallback(() => {
    loadDataRef.current()
  }, [])

  useEffect(() => {
    if (setRefreshHandler && !registeredRef.current) {
      registeredRef.current = true
      setRefreshHandler(() => refreshApp())
    }
    return () => {
      if (setRefreshHandler && registeredRef.current) {
        registeredRef.current = false
        setRefreshHandler(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Per-view loaders: each fetches only the data needed for that tab.
  // Loading one tab at a time (instead of all 4 upfront) makes the initial
  // render immediate and keeps tab switches snappy for cached views.
  const loadCustomersView = useCallback(async () => {
    const result = await api.callTool('list_customers', { limit: 250 })
    const data = (result as any)?.customers ?? result
    setCustomers(Array.isArray(data) ? data : [])
  }, [api])

  const loadProductsView = useCallback(async () => {
    const result = await api.callTool('list_products', { limit: 250 })
    const data = (result as any)?.products ?? result
    setProducts(Array.isArray(data) ? data : [])
  }, [api])

  const loadOrdersView = useCallback(async () => {
    const result = await api.callTool('list_orders', { status: 'any' })
    const data = (result as any)?.orders ?? result
    const ordersList = Array.isArray(data) ? data : []
    setOrders(ordersList.map((o: any) => stripAddressName(o)))
  }, [api])

  const loadDraftsView = useCallback(async () => {
    const result = await api.callTool('list_draft_orders', {})
    const data = (result as any)?.draft_orders ?? result
    setDraftOrders(Array.isArray(data) ? data : [])
  }, [api])

  const loadView = useCallback(async (view: View) => {
    setContentLoading(true)
    setError(null)
    try {
      if (view === 'customers') await loadCustomersView()
      else if (view === 'products') await loadProductsView()
      else if (view === 'orders') await loadOrdersView()
      else if (view === 'drafts') await loadDraftsView()
      // discounts is local-only; collections has its own loader (loadCollections)
      setLoadedViews(prev => ({ ...prev, [view]: true }))
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${view}`)
    } finally {
      setContentLoading(false)
    }
  }, [loadCustomersView, loadProductsView, loadOrdersView, loadDraftsView])

  // Reload the current view and mark other API-backed views as stale so they
  // refetch on next visit. Used by mutations and the Refresh button.
  const loadData = useCallback(async () => {
    setLoadedViews(prev => ({
      ...prev,
      customers: false,
      products: false,
      orders: false,
      drafts: false,
      collections: false,
    }))
    await loadView(currentView)
  }, [currentView, loadView])

  useEffect(() => {
    loadDataRef.current = loadData
  })

  useEffect(() => {
    loadView(currentView)
    // Only run on mount — tab changes are handled by the tab click handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatCurrency = (amount: string | undefined) => {
    if (!amount) return '$0.00'
    const num = parseFloat(amount)
    return `$${num.toFixed(2)}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatFulfillmentStatus = (status: string): string => {
    const labels: Record<string, string> = {
      'open': 'Unfulfilled',
      'fulfilled': 'Fulfilled',
      'partial': 'Partially Fulfilled',
      'restocked': 'Restocked',
    }
    return labels[status] || status
  }

  // Search functions using API
  const handleSearch = async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      // Reload the current view's data when search is cleared
      await loadView(currentView)
      return
    }

    try {
      if (currentView === 'customers') {
        const result = await api.callTool('search_customers', { query })
        const customerData = (result as any)?.customers || result
        setCustomers(Array.isArray(customerData) ? customerData : [])
      } else if (currentView === 'products') {
        const result = await api.callTool('search_products', { query })
        const prodData = (result as any)?.products || result
        setProducts(Array.isArray(prodData) ? prodData : [])
      }
    } catch (err) {
      console.error('Search failed:', err)
    }
  }

  // Customer Management Functions
  const loadCustomerDetails = async (customerId: string) => {
    // Seed from the list entry so the panel fills immediately (name, email,
    // counts) while the full details + orders are still loading.
    const fallback = customers.find(c => c.id === customerId) || null
    if (fallback) setSelectedCustomer(fallback)
    setCustomerOrders([])
    setDetailLoading(true)
    try {
      const [detailsResult, ordersResult] = await Promise.allSettled([
        api.callTool('get_customer_by_id', { customer_id: customerId }),
        api.callTool('get_customer_orders', { customer_id: customerId, status: 'any' }),
      ])
      if (detailsResult.status === 'fulfilled') {
        setSelectedCustomer(detailsResult.value as Customer)
      } else {
        setError(detailsResult.reason instanceof Error ? detailsResult.reason.message : 'Failed to load customer')
      }
      if (ordersResult.status === 'fulfilled') {
        const ordersList = Array.isArray(ordersResult.value) ? ordersResult.value : []
        setCustomerOrders(ordersList.map((o: any) => stripAddressName(o)))
      } else {
        console.error('Failed to load customer orders:', ordersResult.reason)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const loadCustomerOrders = async (customerId: string) => {
    try {
      const result = await api.callTool('get_customer_orders', { customer_id: customerId, status: 'any' })
      const ordersList = Array.isArray(result) ? result : []
      setCustomerOrders(ordersList.map((o: any) => stripAddressName(o)))
    } catch (err) {
      console.error('Failed to load customer orders:', err)
      setCustomerOrders([])
    }
  }

  const loadProductDetails = async (productId: string) => {
    // Set fallback from list data immediately (includes variants)
    const fallback = products.find(p => p.id === productId) || null
    if (fallback) setSelectedProduct(fallback)

    try {
      const result = await api.callTool('get_product_by_id', { product_id: productId })
      const productData = (result as any)?.product || result
      // Merge variants from fallback if API response is missing them
      if (productData && fallback && (!productData.variants || productData.variants.length === 0) && fallback.variants?.length > 0) {
        productData.variants = fallback.variants
      }
      setSelectedProduct(productData)
    } catch (err) {
      console.error('Failed to load product details from API, using list data:', err)
      // fallback already set above
    }
  }

  // Address functions
  const loadCustomerAddresses = async (customerId: string) => {
    try {
      const result = await api.callTool('list_addresses', { customer_id: customerId })
      setAddressLookupResult(Array.isArray(result) ? result : [])
    } catch (err) {
      console.error('Failed to load addresses:', err)
    }
  }

  const lookupAddress = async (customerId: string, addressId: string) => {
    try {
      const result = await api.callTool('get_address', { customer_id: customerId, address_id: addressId })
      setAddressLookupResult(result)
    } catch (err) {
      console.error('Failed to load address:', err)
    }
  }

  const addCustomerAddress = async (address: Partial<Address>) => {
    if (!selectedCustomer) return
    try {
      await api.callTool('add_address', {
        customer_id: selectedCustomer.id,
        address: address
      })
      await loadCustomerDetails(selectedCustomer.id)
      setShowAddAddressModal(false)
    } catch (err) {
      console.error('Failed to add address:', err)
    }
  }

  const updateCustomerAddress = async (address: Partial<Address>) => {
    if (!selectedCustomer || !editingAddress) return
    try {
      await api.callTool('update_address', {
        customer_id: selectedCustomer.id,
        address_id: editingAddress.id,
        address: address
      })
      await loadCustomerDetails(selectedCustomer.id)
      setShowEditAddressModal(false)
      setEditingAddress(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update address')
    }
  }

  // Order Management Functions
  const loadOrderDetails = async (orderId: string) => {
    const fallback = orders.find(o => o.id === orderId) || null
    if (fallback) setSelectedOrder(fallback)

    setOrderDetailsError(null)

    try {
      const result = await api.callTool('get_order_by_id', { order_id: orderId })
      setSelectedOrder(stripAddressName(result))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load order details'
      setShowOrderErrorDetails(false)
      setOrderDetailsError(msg)
    }
  }

  const createOrder = async (orderData: any) => {
    try {
      await api.callTool('create_order', { order: orderData })
      await loadData()
      setShowNewOrderModal(false)
      setSelectedOrderProduct(null)
      setSelectedVariantId('')
    } catch (err) {
      console.error('Failed to create order:', err)
    }
  }

  const cancelOrder = async (orderId: string) => {
    try {
      await api.callTool('cancel_order', { order_id: orderId })
      await loadData()
      setSelectedOrder(null)
    } catch (err) {
      console.error('Failed to cancel order:', err)
    }
  }

  const closeOrder = async (orderId: string) => {
    try {
      await api.callTool('close_order', { order_id: orderId })
      await loadData()
      if (selectedOrder) {
        const result = await api.callTool('get_order_by_id', { order_id: orderId })
        setSelectedOrder(stripAddressName(result))
      }
    } catch (err) {
      console.error('Failed to close order:', err)
    }
  }

  const reopenOrder = async (orderId: string) => {
    try {
      await api.callTool('reopen_order', { order_id: orderId })
      await loadData()
      if (selectedOrder) {
        const result = await api.callTool('get_order_by_id', { order_id: orderId })
        setSelectedOrder(stripAddressName(result))
      }
    } catch (err) {
      console.error('Failed to reopen order:', err)
    }
  }

  const getOrdersCount = async () => {
    try {
      const result = await api.callTool('count_orders', {})
      setOrdersCount(result.count || 0)
    } catch (err) {
      console.error('Failed to get orders count:', err)
    }
  }

  const createTransaction = async (transactionData: any) => {
    if (!selectedOrder) return

    try {
      await api.callTool('create_an_order_transaction', {
        order_id: selectedOrder.id,
        transaction: transactionData
      })
      const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
      setSelectedOrder(stripAddressName(result))
      setShowNewTransactionModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create transaction')
    }
  }

  // Return and Exchange functions
  const createReturn = async (returnData: { return_line_items: any[] }) => {
    if (!selectedOrder) return
    try {
      await api.callTool('create_return', {
        order_id: selectedOrder.id,
        return_line_items: returnData.return_line_items
      })
      await loadData()
      const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
      setSelectedOrder(stripAddressName(result))
      setShowReturnModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create return')
    }
  }

  const createExchange = async (exchangeData: any) => {
    if (!selectedOrder) return
    try {
      await api.callTool('create_exchange', {
        order_id: selectedOrder.id,
        return_line_items: exchangeData.return_line_items,
        new_line_items: exchangeData.new_line_items,
        exchange_reason: exchangeData.exchange_reason || undefined,
        exchange_note: exchangeData.exchange_note || undefined,
        restock_returned_items: exchangeData.restock_returned_items ?? true
      })
      await loadData()
      const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
      setSelectedOrder(stripAddressName(result))
      setShowExchangeModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exchange')
    }
  }

  // Pending order modification functions
  const modifyPendingOrderAddress = async (shippingAddress: any) => {
    if (!selectedOrder) return
    try {
      await api.callTool('modify_pending_order_address', {
        order_id: selectedOrder.id,
        shipping_address: shippingAddress
      })
      const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
      setSelectedOrder(stripAddressName(result))
      setShowModifyAddressModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify order address')
    }
  }

  const modifyPendingOrderItems = async (itemsData: any) => {
    if (!selectedOrder) return
    try {
      await api.callTool('modify_pending_order_items', {
        order_id: selectedOrder.id,
        ...itemsData
      })
      await loadData()
      const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
      setSelectedOrder(stripAddressName(result))
      setShowModifyItemsModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify order items')
    }
  }

  const modifyPendingOrderPayment = async (transactions: any[]) => {
    if (!selectedOrder) return
    try {
      await api.callTool('modify_pending_order_payment', {
        order_id: selectedOrder.id,
        transactions
      })
      const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
      setSelectedOrder(stripAddressName(result))
      setShowModifyPaymentModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to modify order payment')
    }
  }

  // Transfer to human agents
  const transferToHuman = async (summary: string) => {
    try {
      await api.callTool('transfer_to_human_agents', { summary })
      setShowTransferModal(false)
      alert('Successfully transferred to human agents.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer to human agents')
    }
  }

  // Draft Order Functions
  const loadDraftDetails = async (draftId: string) => {
    // Seed from the list entry for instant first paint.
    const fallback = draftOrders.find(d => d.id === draftId) || null
    if (fallback) setSelectedDraft(fallback)
    setDetailLoading(true)
    try {
      const result = await api.callTool('get_draft_order_by_id', { draft_order_id: draftId })
      setSelectedDraft(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load draft order')
    } finally {
      setDetailLoading(false)
    }
  }

  const createDraftOrder = async (draftData: any) => {
    try {
      await api.callTool('create_draft_order', { draft_order: draftData })
      await loadData()
      setShowNewDraftModal(false)
    } catch (err) {
      console.error('Failed to create draft order:', err)
    }
  }

  // Discount management (stored locally, applied via draft orders)
  const addDiscountCode = (discount: DiscountCode) => {
    setDiscountCodes(prev => [...prev, { ...discount, id: `disc_${Date.now()}` }])
  }

  const deleteDiscountCode = (discountId: string) => {
    setDiscountCodes(prev => prev.filter(d => d.id !== discountId))
    if (selectedDiscount?.id === discountId) setSelectedDiscount(null)
  }

  // Apply discount to a new draft order
  const createDraftWithDiscount = async (draftData: any, discount: DiscountCode | null) => {
    const data = { ...draftData }
    if (discount) {
      data.applied_discount = {
        title: discount.title,
        description: discount.description || '',
        value: discount.value,
        value_type: discount.value_type,
        amount: discount.value_type === 'fixed_amount' ? discount.value : '0'
      }
    }
    try {
      await api.callTool('create_draft_order', { draft_order: data })
      await loadData()
    } catch (err) {
      console.error('Failed to create draft with discount:', err)
    }
  }

  // Collection management
  const loadCollections = useCallback(async () => {
    try {
      // Try to get products and group by collection
      const result = await api.callTool('list_products', { limit: 250 })
      const prodData = (result as any)?.products || result
      const allProducts: Product[] = Array.isArray(prodData) ? prodData : []

      // Extract unique collections from products' tags or build from known collection_ids
      // Since no dedicated collection API exists, build collections from product data
      const collectionMap = new Map<string, Collection>()

      // Group products by product_type as pseudo-collections
      allProducts.forEach(p => {
        if (p.product_type) {
          const key = p.product_type.toLowerCase().replace(/\s+/g, '-')
          if (!collectionMap.has(key)) {
            collectionMap.set(key, {
              id: key,
              title: p.product_type,
              collection_type: 'smart',
              products: []
            })
          }
          collectionMap.get(key)!.products!.push(p.id)
        }
      })

      setCollections(Array.from(collectionMap.values()))
    } catch (err) {
      console.error('Failed to load collections:', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCollectionProducts = async (collection: Collection) => {
    setSelectedCollection(collection)
    if (collection.products && collection.products.length > 0) {
      const matchingProducts = products.filter(p => collection.products!.includes(p.id))
      setCollectionProducts(matchingProducts)
    } else {
      // Filter from all products by product_type
      const matchingProducts = products.filter(p =>
        p.product_type?.toLowerCase() === collection.title.toLowerCase()
      )
      setCollectionProducts(matchingProducts)
    }
  }

  // Full-screen spinner is intentionally avoided here — the top bar and tabs
  // stay mounted during loads so switching tabs only swaps the content area.

  // Error is shown as a dismissible banner instead of blocking the whole UI,
  // so the app remains usable even when some API calls (e.g. orders) fail.

  const updateDraftOrder = async (draftId: string, draftData: any) => {
    try {
      await api.callTool('update_draft_order', {
        draft_order_id: draftId,
        draft_order: draftData
      })

      await loadData()

      await loadDraftDetails(draftId)

      setShowEditDraftModal(false)
      setEditingDraft(null)

    } catch (err) {
      console.error('Failed to update draft order:', err)
      setError(err instanceof Error ? err.message : 'Failed to update draft order')
    }
  }

  // Client-side filtering for orders and drafts (search_customers and search_products use API)
  const filteredCustomers = customers
  const filteredProducts = products

  const filteredOrders = orders.filter(o =>
    `${o.name} ${o.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredDrafts = draftOrders.filter(d =>
    `${d.name} ${d.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col bg-[#f7f5f0]">
      {/* Top Navigation Bar */}
      <div className="bg-gradient-to-r from-[#3F35BF] to-[#4F46E5] text-white px-8 py-4 shadow-[0_1px_2px_rgba(15,15,40,0.08)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center text-base font-semibold tracking-tight ring-1 ring-white/10">S</div>
            <h1 className="text-base font-semibold tracking-tight">{APP_NAME}</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 bg-[#C2410C]/90 hover:bg-[#C2410C] rounded-full transition-all text-sm font-medium shadow-sm hover:shadow"
            >
              Transfer to Human
            </button>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 ring-1 ring-white/15 rounded-full transition-all text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/70">
        <div className="flex gap-1 px-6 pt-2">
          {(['customers', 'products', 'orders', 'drafts', 'discounts', 'collections'] as View[]).map((view) => (
            <button
              key={view}
              onClick={() => {
                // If the outgoing view had an active search, its list state is
                // filtered — invalidate it so revisiting refetches the full set.
                const previousView = currentView
                const hadActiveSearch = searchQuery.trim().length > 0 &&
                  (previousView === 'customers' || previousView === 'products')

                setCurrentView(view)
                setSearchQuery('')
                setSelectedCustomer(null)
                setSelectedProduct(null)
                setSelectedOrder(null)
                setSelectedDraft(null)
                setSelectedCollection(null)
                setSelectedDiscount(null)
                setCustomerOrders([])

                if (hadActiveSearch) {
                  setLoadedViews(prev => ({ ...prev, [previousView]: false }))
                }

                // Only fetch data for the tab if it hasn't been loaded (or was
                // invalidated by a mutation). Already-loaded tabs render
                // instantly from cached state.
                if (!loadedViews[view]) {
                  if (view === 'collections') {
                    setContentLoading(true)
                    loadCollections()
                      .catch(() => { })
                      .finally(() => {
                        setLoadedViews(prev => ({ ...prev, collections: true }))
                        setContentLoading(false)
                      })
                  } else if (view !== 'discounts') {
                    loadView(view)
                  }
                }
              }}
              className={`relative px-4 py-3 mb-[-1px] text-sm font-medium capitalize transition-all rounded-t-lg ${currentView === view
                ? 'text-[#4338CA] bg-white border-b-2 border-[#4338CA]'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100/60 border-b-2 border-transparent'
                }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50/80 border-b border-red-200/60 px-6 py-2.5 flex items-center justify-between">
          <p className="text-red-700 text-sm font-medium">{error}</p>
          <div className="flex gap-2">
            <button onClick={loadData} className="text-xs font-medium px-3 py-1.5 bg-white hover:bg-red-50 text-red-700 ring-1 ring-red-200 rounded-full transition-all">Retry</button>
            <button onClick={() => setError(null)} className="text-xs font-medium px-3 py-1.5 text-red-600 hover:text-red-800 transition-colors">Dismiss</button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar List */}
        <div className="w-96 bg-white/70 backdrop-blur-sm border-r border-gray-200/60 flex flex-col">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
              <input
                type="text"
                placeholder={`Search ${currentView}...`}
                value={searchQuery}
                onChange={(e) => {
                  const q = e.target.value
                  setSearchQuery(q)
                  // Debounce API search for customers and products
                  if (currentView === 'customers' || currentView === 'products') {
                    if (!q.trim()) {
                      loadView(currentView)
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (currentView === 'customers' || currentView === 'products')) {
                    handleSearch(searchQuery)
                  }
                }}
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-transparent rounded-lg focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 text-sm text-gray-900 placeholder-gray-400 transition-all"
              />
            </div>
            {(currentView === 'customers' || currentView === 'products') && searchQuery.trim() && (
              <button
                onClick={() => handleSearch(searchQuery)}
                className="mt-2 w-full px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg transition-all text-sm font-medium shadow-sm hover:shadow"
              >
                Search
              </button>
            )}
          </div>

          {/* Action Buttons */}
          {(currentView === 'orders' || currentView === 'drafts') && (
            <div className="p-4 border-b border-gray-100 space-y-2">
              <button
                onClick={() => currentView === 'orders' ? setShowNewOrderModal(true) : setShowNewDraftModal(true)}
                className="w-full px-4 py-2.5 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg transition-all text-sm font-medium shadow-sm hover:shadow"
              >
                + New {currentView === 'orders' ? 'Order' : 'Draft'}
              </button>
              {currentView === 'orders' && (
                <button
                  onClick={getOrdersCount}
                  className="w-full px-4 py-2.5 bg-white hover:bg-gray-50 ring-1 ring-gray-200 text-gray-700 rounded-lg transition-all text-sm font-medium"
                >
                  {ordersCount !== null ? `Total Orders: ${ordersCount}` : 'Get Orders Count'}
                </button>
              )}
            </div>
          )}

          {/* Discount action buttons */}
          {currentView === 'discounts' && (
            <div className="p-4 border-b border-gray-100">
              <button
                onClick={() => setShowNewDiscountModal(true)}
                className="w-full px-4 py-2.5 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg transition-all text-sm font-medium shadow-sm hover:shadow"
              >
                + New Discount
              </button>
            </div>
          )}

          {/* Address Lookup for Customers tab */}
          {currentView === 'customers' && (
            <div className="p-4 border-b border-gray-100">
              <button
                onClick={() => {
                  setShowAddressLookupModal(true)
                  setAddressLookupResult(null)
                  setAddressLookupCustomerId('')
                  setAddressLookupAddressId('')
                }}
                className="w-full px-4 py-2 bg-white hover:bg-gray-50 ring-1 ring-gray-200 text-gray-700 rounded-lg transition-all text-sm font-medium"
              >
                Address Lookup
              </button>
            </div>
          )}

          {/* List Items */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {contentLoading && !loadedViews[currentView] ? (
              <div className="h-full flex items-center justify-center py-16">
                <div className="w-8 h-8 border-[3px] border-[#4338CA]/20 border-t-[#4338CA] rounded-full animate-spin" />
              </div>
            ) : (
            <>
            {currentView === 'customers' && (
              <div className="space-y-1">
                {filteredCustomers.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    No customers found
                  </div>
                ) : (
                  filteredCustomers.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => loadCustomerDetails(customer.id)}
                      className={`w-full px-3 py-3 text-left rounded-xl transition-all ${selectedCustomer?.id === customer.id ? 'bg-[#4338CA]/8 ring-1 ring-[#4338CA]/30 shadow-sm' : 'hover:bg-gray-50/80'}`}
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {customer.first_name} {customer.last_name}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{customer.id}]</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{customer.email}</div>
                      <div className="text-[11px] text-gray-400 mt-1.5 tracking-wide">
                        {customer.orders_count} orders · {formatCurrency(customer.total_spent)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {currentView === 'products' && (
              <div className="space-y-1">
                {filteredProducts.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    No products found
                  </div>
                ) : (
                  filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => loadProductDetails(product.id)}
                      className={`w-full px-3 py-3 text-left rounded-xl transition-all ${selectedProduct?.id === product.id ? 'bg-[#4338CA]/8 ring-1 ring-[#4338CA]/30 shadow-sm' : 'hover:bg-gray-50/80'}`}
                    >
                      <div className="font-medium text-gray-900 text-sm">{product.title}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{product.id}]</span></div>
                      <div className="text-xs text-gray-500 mt-0.5">{product.vendor}</div>
                      <div className="text-[11px] text-gray-400 mt-1.5 tracking-wide">
                        {product.variants?.length || 0} variants · {product.status}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {currentView === 'orders' && (
              <div className="space-y-1">
                {filteredOrders.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    No orders found
                  </div>
                ) : (
                  filteredOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => {
                        setSelectedOrder(order)
                        setOrderDetailsError(null)
                        loadOrderDetails(order.id)
                      }}
                      className={`w-full px-3 py-3 text-left rounded-xl transition-all ${selectedOrder?.id === order.id ? 'bg-[#4338CA]/8 ring-1 ring-[#4338CA]/30 shadow-sm' : 'hover:bg-gray-50/80'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-gray-900 text-sm">{order.name}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{order.id}]</span></div>
                        <span className="text-sm font-semibold text-gray-900">{formatCurrency(order.total_price)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{order.email || 'No email'}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-gray-400 tracking-wide">
                          {formatDate(order.created_at)}
                        </span>
                        <div className="flex gap-1">
                          <span className={`text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ${order.financial_status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' :
                            order.financial_status === 'pending' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                            {order.financial_status}
                          </span>
                          {order.fulfillment_status && (
                            <span className={`text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ${order.fulfillment_status === 'fulfilled' ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60' :
                              'bg-gray-100 text-gray-600'
                              }`}>
                              {formatFulfillmentStatus(order.fulfillment_status)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {currentView === 'drafts' && (
              <div className="space-y-1">
                {filteredDrafts.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    No draft orders found
                  </div>
                ) : (
                  filteredDrafts.map((draft) => (
                    <button
                      key={draft.id}
                      onClick={() => loadDraftDetails(draft.id)}
                      className={`w-full px-3 py-3 text-left rounded-xl transition-all ${selectedDraft?.id === draft.id ? 'bg-[#4338CA]/8 ring-1 ring-[#4338CA]/30 shadow-sm' : 'hover:bg-gray-50/80'}`}
                    >
                      <div className="font-medium text-gray-900 text-sm">
                        {draft.name || `Draft ${draft.id.slice(0, 8)}`}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{draft.id}]</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{draft.email || 'No email'}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ${draft.status === 'open' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' :
                          draft.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' :
                            'bg-sky-50 text-sky-700 ring-1 ring-sky-200/60'
                          }`}>
                          {draft.status}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(draft.total_price)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {currentView === 'discounts' && (
              <div className="space-y-1">
                {discountCodes.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    No discount codes yet. Create one to get started.
                  </div>
                ) : (
                  discountCodes.map((discount) => (
                    <button
                      key={discount.id}
                      onClick={() => setSelectedDiscount(discount)}
                      className={`w-full px-3 py-3 text-left rounded-xl transition-all ${selectedDiscount?.id === discount.id ? 'bg-[#4338CA]/8 ring-1 ring-[#4338CA]/30 shadow-sm' : 'hover:bg-gray-50/80'}`}
                    >
                      <div className="font-medium text-gray-900 text-sm">{discount.title}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{discount.id}]</span></div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {discount.value_type === 'percentage' ? `${discount.value}% off` : `$${discount.value} off`}
                      </div>
                      {discount.description && (
                        <div className="text-[11px] text-gray-400 mt-1">{discount.description}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            {currentView === 'collections' && (
              <div className="space-y-1">
                {collections.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm">
                    No collections found. Collections are derived from product types.
                  </div>
                ) : (
                  collections.map((collection) => (
                    <button
                      key={collection.id}
                      onClick={() => loadCollectionProducts(collection)}
                      className={`w-full px-3 py-3 text-left rounded-xl transition-all ${selectedCollection?.id === collection.id ? 'bg-[#4338CA]/8 ring-1 ring-[#4338CA]/30 shadow-sm' : 'hover:bg-gray-50/80'}`}
                    >
                      <div className="font-medium text-gray-900 text-sm">{collection.title}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{collection.id}]</span></div>
                      <div className="text-[11px] text-gray-400 mt-1 tracking-wide">
                        {collection.products?.length || 0} products
                      </div>
                      {collection.collection_type && (
                        <span className="inline-block mt-2 text-[10px] font-medium tracking-wide px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {collection.collection_type}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            </>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="flex-1 bg-white overflow-y-auto">
          {/* Customer Detail */}
          {currentView === 'customers' && selectedCustomer && (
            <div className="p-8 max-w-4xl">
              <div className="mb-8">
                <h2 className="text-[26px] leading-tight font-semibold text-gray-900 tracking-tight mb-1.5">
                  {selectedCustomer.first_name} {selectedCustomer.last_name}<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedCustomer.id}]</span>
                </h2>
                <p className="text-gray-500 text-sm">{selectedCustomer.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="relative bg-white p-5 rounded-2xl ring-1 ring-gray-200/70 shadow-[0_1px_2px_rgba(15,15,40,0.04)]">
                  <div className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Orders</div>
                  <div className="text-3xl font-semibold text-gray-900 tabular-nums tracking-tight">
                    {selectedCustomer.orders_count}
                  </div>
                </div>
                <div className="relative bg-white p-5 rounded-2xl ring-1 ring-gray-200/70 shadow-[0_1px_2px_rgba(15,15,40,0.04)]">
                  <div className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Total Spent</div>
                  <div className="text-3xl font-semibold text-gray-900 tabular-nums tracking-tight">
                    {formatCurrency(selectedCustomer.total_spent)}
                  </div>
                </div>
              </div>

              {selectedCustomer.phone && (
                <div className="mb-8">
                  <h3 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Phone</h3>
                  <p className="text-gray-800 text-sm">{selectedCustomer.phone}</p>
                </div>
              )}

              {/* Customer Orders (loaded via get_customer_orders API) */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 tracking-tight">Recent Orders</h3>
                {detailLoading && customerOrders.length === 0 ? (
                  <div className="space-y-2" aria-busy="true" aria-label="Loading recent orders">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="p-4 bg-white rounded-xl ring-1 ring-gray-200/70 animate-pulse">
                        <div className="flex justify-between items-start mb-2">
                          <div className="h-4 w-24 bg-gray-200 rounded" />
                          <div className="h-4 w-16 bg-gray-200 rounded" />
                        </div>
                        <div className="h-3 w-32 bg-gray-100 rounded mb-2" />
                        <div className="h-5 w-14 bg-gray-100 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : customerOrders.length > 0 ? (
                  <div className="space-y-2">
                    {customerOrders
                      .slice(0, 5)
                      .map((order) => (
                        <div key={order.id} className="group p-4 bg-white rounded-xl ring-1 ring-gray-200/70 hover:ring-[#4338CA]/40 hover:shadow-[0_2px_8px_rgba(67,56,202,0.08)] transition-all cursor-pointer"
                          onClick={() => {
                            setCurrentView('orders')
                            setSelectedOrder(order)
                            setOrderDetailsError(null)
                            loadOrderDetails(order.id)
                          }}
                        >
                          <div className="flex justify-between items-start mb-1.5">
                            <div className="font-medium text-gray-900 text-sm">{order.name}<span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{order.id}]</span></div>
                            <div className="font-semibold text-gray-900 text-sm tabular-nums">{formatCurrency(order.total_price)}</div>
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(order.created_at)}</div>
                          <div className="flex gap-2 mt-2">
                            <span className={`text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ${order.financial_status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' :
                              order.financial_status === 'pending' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' :
                                'bg-gray-100 text-gray-600'
                              }`}>
                              {order.financial_status}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No orders yet</p>
                )}
              </div>

              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Addresses</h3>
                  <button
                    onClick={() => setShowAddAddressModal(true)}
                    className="px-3 py-1.5 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow"
                  >
                    + Add Address
                  </button>
                </div>
                {/* `addresses` is absent in the list response and only arrives
                    via get_customer_by_id — undefined signals "still loading"
                    vs an empty array which means "no addresses". */}
                {detailLoading && !selectedCustomer.addresses ? (
                  <div className="space-y-3" aria-busy="true" aria-label="Loading addresses">
                    {[0, 1].map(i => (
                      <div key={i} className="p-4 bg-white rounded-xl ring-1 ring-gray-200/70 animate-pulse">
                        <div className="h-5 w-16 bg-gray-100 rounded-full mb-3" />
                        <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
                        <div className="h-3 w-52 bg-gray-100 rounded mb-1" />
                        <div className="h-3 w-44 bg-gray-100 rounded mb-1" />
                        <div className="h-3 w-28 bg-gray-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : selectedCustomer.addresses && selectedCustomer.addresses.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCustomer.addresses.map((address) => (
                      <div key={address.id} className="p-4 bg-white rounded-xl ring-1 ring-gray-200/70 hover:ring-gray-300 transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            {address.default && (
                              <span className="inline-block px-2 py-0.5 bg-sky-50 text-sky-700 ring-1 ring-sky-200/60 text-[10px] font-medium tracking-wide rounded-full mb-1">
                                Default
                              </span>
                            )}
                            <span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)' }}>[{address.id}]</span>
                          </div>
                          <button
                            onClick={() => {
                              setEditingAddress(address)
                              setShowEditAddressModal(true)
                            }}
                            className="text-[#4338CA] hover:text-[#3F35BF] text-xs font-medium transition-colors"
                          >
                            Edit
                          </button>
                        </div>
                        <div className="text-gray-900 text-sm font-medium">
                          {address.first_name} {address.last_name}
                        </div>
                        <div className="text-gray-600 text-sm">{address.address1}</div>
                        {address.address2 && (
                          <div className="text-gray-600 text-sm">{address.address2}</div>
                        )}
                        <div className="text-gray-600 text-sm">
                          {address.city}, {address.province} {address.zip}
                        </div>
                        <div className="text-gray-600 text-sm">{address.country}</div>
                        {address.phone && (
                          <div className="text-gray-500 text-xs mt-1.5">{address.phone}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No addresses</p>
                )}
              </div>
            </div>
          )}

          {/* Product Detail */}
          {currentView === 'products' && selectedProduct && (
            <div className="p-8 max-w-5xl">
              <div className="mb-8">
                <h2 className="text-[26px] leading-tight font-semibold text-gray-900 tracking-tight mb-3">
                  {selectedProduct.title}<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedProduct.id}]</span>
                </h2>
                <div className="flex gap-2 flex-wrap mb-4">
                  <span className="text-xs font-medium tracking-wide px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                    {selectedProduct.vendor}
                  </span>
                  <span className={`text-xs font-medium tracking-wide px-2.5 py-1 rounded-full ${selectedProduct.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' :
                    selectedProduct.status === 'draft' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                    {selectedProduct.status}
                  </span>
                  {selectedProduct.product_type && (
                    <span className="text-xs font-medium tracking-wide px-2.5 py-1 bg-violet-50 text-violet-700 ring-1 ring-violet-200/60 rounded-full">
                      {selectedProduct.product_type}
                    </span>
                  )}
                </div>
                {selectedProduct.tags && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedProduct.tags.split(',').map((tag, i) => (
                      <span key={i} className="text-[11px] font-medium px-2 py-0.5 bg-gray-50 text-gray-600 ring-1 ring-gray-200/70 rounded-md">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {selectedProduct.body_html && (
                <div className="mb-8">
                  <h3 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Description</h3>
                  <div className="text-gray-700 text-sm leading-relaxed prose max-w-none">
                    {selectedProduct.body_html.replace(/<[^>]*>/g, '')}
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-3">Variants</h3>
                <div className="overflow-hidden bg-white rounded-2xl ring-1 ring-gray-200/70 shadow-[0_1px_2px_rgba(15,15,40,0.04)]">
                  <table className="w-full">
                    <thead className="bg-gray-50/60">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          SKU
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          Price
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          Compare At
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          Inventory
                        </th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold tracking-wider text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedProduct.variants?.map((variant) => (
                        <tr key={variant.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-900 font-medium">{variant.title}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{variant.id}]</span></td>
                          <td className="px-4 py-3 text-sm text-gray-500 font-mono">{variant.sku || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">{formatCurrency(variant.price)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 tabular-nums">{variant.compare_at_price ? formatCurrency(variant.compare_at_price) : '-'}</td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              defaultValue={variant.inventory_quantity}
                              key={`inv-${variant.id}-${variant.inventory_quantity}`}
                              className="w-20 px-2.5 py-1.5 bg-gray-50 border border-transparent rounded-lg text-gray-900 text-sm tabular-nums focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                              onBlur={async (e) => {
                                const newQty = parseInt(e.target.value)
                                if (isNaN(newQty) || newQty === variant.inventory_quantity) return
                                const diff = variant.inventory_quantity - newQty
                                if (diff > 0) {
                                  // Reduce inventory by creating an order
                                  try {
                                    await api.callTool('create_order', {
                                      order: {
                                        email: 'inventory-adjustment@shopster-admin.local',
                                        financial_status: 'paid',
                                        line_items: [{
                                          title: `${selectedProduct.title} - ${variant.title} (Inventory Adjustment)`,
                                          price: '0.00',
                                          quantity: diff,
                                          product_id: selectedProduct.id,
                                          variant_id: variant.id,
                                          admin_graphql_api_id: '',
                                          sku: variant.sku || '',
                                          variant_title: variant.title,
                                          name: selectedProduct.title,
                                          fulfillable_quantity: diff,
                                          vendor: selectedProduct.vendor || ''
                                        }]
                                      }
                                    })
                                    await loadData()
                                    await loadProductDetails(selectedProduct.id)
                                  } catch (err) {
                                    console.error('Failed to adjust inventory:', err)
                                    e.target.value = String(variant.inventory_quantity)
                                  }
                                } else {
                                  // Update the local display for increases (no direct API for adding inventory)
                                  setSelectedProduct(prev => {
                                    if (!prev) return prev
                                    return {
                                      ...prev,
                                      variants: prev.variants.map(v =>
                                        v.id === variant.id ? { ...v, inventory_quantity: newQty } : v
                                      )
                                    }
                                  })
                                }
                              }}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ${variant.inventory_quantity > 10 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' :
                              variant.inventory_quantity > 0 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' :
                                'bg-red-50 text-red-700 ring-1 ring-red-200/60'
                              }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${variant.inventory_quantity > 10 ? 'bg-emerald-500' : variant.inventory_quantity > 0 ? 'bg-amber-500' : 'bg-red-500'}`} />
                              {variant.inventory_quantity > 10 ? 'In Stock' : variant.inventory_quantity > 0 ? 'Low Stock' : 'Out of Stock'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Order Detail */}
          {currentView === 'orders' && selectedOrder && (
            <div className="p-8 max-w-5xl">
              {orderDetailsError && (
                <div className="mb-5 p-4 rounded-xl bg-amber-50/70 ring-1 ring-amber-200/60 text-amber-900 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      Some order details could not be loaded from the backend (schema validation). Displaying cached order data instead.
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOrderErrorDetails(v => !v)}
                      className="shrink-0 text-xs font-medium underline hover:no-underline"
                    >
                      {showOrderErrorDetails ? 'Hide details' : 'Show details'}
                    </button>
                  </div>

                  {showOrderErrorDetails && (
                    <pre className="mt-2 text-xs whitespace-pre-wrap break-words opacity-80">
                      {orderDetailsError}
                    </pre>
                  )}
                </div>
              )}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <h2 className="text-[26px] leading-tight font-semibold text-gray-900 tracking-tight">{selectedOrder.name}<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedOrder.id}]</span></h2>
                  <div className="flex gap-2 flex-wrap">
                    {!selectedOrder.cancelled_at && !selectedOrder.closed_at && (
                      <>
                        <button
                          onClick={() => closeOrder(selectedOrder.id)}
                          className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 ring-1 ring-gray-200 rounded-full text-xs font-medium transition-all"
                        >
                          Close Order
                        </button>
                        <button
                          onClick={() => cancelOrder(selectedOrder.id)}
                          className="px-4 py-2 bg-white hover:bg-red-50 text-red-700 ring-1 ring-red-200 rounded-full text-xs font-medium transition-all"
                        >
                          Cancel Order
                        </button>
                      </>
                    )}
                    {selectedOrder.closed_at && !selectedOrder.cancelled_at && (
                      <button
                        onClick={() => reopenOrder(selectedOrder.id)}
                        className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow"
                      >
                        Reopen Order
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mb-2 items-center">
                  <select
                    value={selectedOrder.financial_status}
                    onChange={async (e) => {
                      const newStatus = e.target.value
                      const kindMap: Record<string, string> = {
                        'paid': 'sale',
                        'authorized': 'authorization',
                        'refunded': 'refund',
                        'voided': 'void',
                        'pending': 'void',
                      }
                      const kind = kindMap[newStatus] || 'sale'
                      try {
                        await api.callTool('create_an_order_transaction', {
                          order_id: selectedOrder.id,
                          transaction: {
                            kind,
                            gateway: 'manual',
                            amount: selectedOrder.total_price,
                            currency: (selectedOrder as any).currency || 'USD',
                            test: false
                          }
                        })
                        const result = await api.callTool('get_order_by_id', { order_id: selectedOrder.id })
                        setSelectedOrder(stripAddressName(result))
                        await loadData()
                      } catch (err) {
                        console.error('Failed to update order status:', err)
                      }
                    }}
                    className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full border-0 cursor-pointer ring-1 transition-all ${selectedOrder.financial_status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' :
                      selectedOrder.financial_status === 'pending' ? 'bg-amber-50 text-amber-700 ring-amber-200/60' :
                        'bg-gray-100 text-gray-600 ring-gray-200/60'
                      }`}
                  >
                    <option value="pending">pending</option>
                    <option value="authorized">authorized</option>
                    <option value="paid">paid</option>
                    <option value="refunded">refunded</option>
                    <option value="voided">voided</option>
                  </select>
                  {selectedOrder.fulfillment_status && (
                    <span className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full ring-1 ${selectedOrder.fulfillment_status === 'fulfilled' ? 'bg-sky-50 text-sky-700 ring-sky-200/60' :
                      'bg-gray-100 text-gray-600 ring-gray-200/60'
                      }`}>
                      {formatFulfillmentStatus(selectedOrder.fulfillment_status)}
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-sm">
                  Order #{selectedOrder.order_number} · {formatDate(selectedOrder.created_at)}
                </p>
              </div>

              {selectedOrder.customer && (
                <div className="mb-8">
                  <h3 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Customer</h3>
                  <div className="text-gray-900 text-sm font-medium">
                    {selectedOrder.customer.first_name} {selectedOrder.customer.last_name}<span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedOrder.customer.id}]</span>
                  </div>
                  <div className="text-gray-500 text-sm">{selectedOrder.customer.email}</div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {selectedOrder.shipping_address && (
                  <div>
                    <h3 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Shipping Address</h3>
                    <div className="p-4 bg-white rounded-xl ring-1 ring-gray-200/70">
                      {(selectedOrder.shipping_address.first_name || selectedOrder.shipping_address.last_name) && (
                        <div className="text-gray-900 font-medium text-sm">
                          {selectedOrder.shipping_address.first_name} {selectedOrder.shipping_address.last_name}
                        </div>
                      )}
                      {selectedOrder.shipping_address.address1 && (
                        <div className="text-gray-600 text-sm">{selectedOrder.shipping_address.address1}</div>
                      )}
                      {selectedOrder.shipping_address.address2 && (
                        <div className="text-gray-600 text-sm">{selectedOrder.shipping_address.address2}</div>
                      )}
                      <div className="text-gray-600 text-sm">
                        {[selectedOrder.shipping_address.city, selectedOrder.shipping_address.province, selectedOrder.shipping_address.zip].filter(Boolean).join(', ')}
                      </div>
                      {selectedOrder.shipping_address.country && (
                        <div className="text-gray-600 text-sm">{selectedOrder.shipping_address.country}</div>
                      )}
                      {selectedOrder.shipping_address.phone && (
                        <div className="text-gray-500 text-xs mt-1.5">{selectedOrder.shipping_address.phone}</div>
                      )}
                    </div>
                  </div>
                )}

                {(selectedOrder as any).billing_address && (
                  <div>
                    <h3 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Billing Address</h3>
                    <div className="p-4 bg-white rounded-xl ring-1 ring-gray-200/70">
                      {((selectedOrder as any).billing_address.first_name || (selectedOrder as any).billing_address.last_name) && (
                        <div className="text-gray-900 font-medium text-sm">
                          {(selectedOrder as any).billing_address.first_name} {(selectedOrder as any).billing_address.last_name}
                        </div>
                      )}
                      {(selectedOrder as any).billing_address.address1 && (
                        <div className="text-gray-600 text-sm">{(selectedOrder as any).billing_address.address1}</div>
                      )}
                      {(selectedOrder as any).billing_address.address2 && (
                        <div className="text-gray-600 text-sm">{(selectedOrder as any).billing_address.address2}</div>
                      )}
                      <div className="text-gray-600 text-sm">
                        {[(selectedOrder as any).billing_address.city, (selectedOrder as any).billing_address.province, (selectedOrder as any).billing_address.zip].filter(Boolean).join(', ')}
                      </div>
                      {(selectedOrder as any).billing_address.country && (
                        <div className="text-gray-600 text-sm">{(selectedOrder as any).billing_address.country}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-3">Items</h3>
                <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden divide-y divide-gray-100">
                  {selectedOrder.line_items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center p-4 hover:bg-gray-50/40 transition-colors">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{item.title}<span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{item.id}]</span></div>
                        <div className="text-xs text-gray-500 mt-0.5">Quantity: {item.quantity}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900 text-sm tabular-nums">
                          {formatCurrency(item.price)}
                        </div>
                        <div className="text-xs text-gray-500 tabular-nums">
                          {formatCurrency((parseFloat(item.price) * item.quantity).toString())}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#4338CA]/5 to-[#C2410C]/5 ring-1 ring-[#4338CA]/15 rounded-2xl px-5 py-4 mb-8">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 tracking-tight">Total</span>
                  <span className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight">{formatCurrency(selectedOrder.total_price)}</span>
                </div>
              </div>

              {/* Order Actions: Returns, Exchanges, Modifications */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-3">Order Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowReturnModal(true)}
                    className="px-4 py-2 bg-white hover:bg-orange-50 text-orange-700 ring-1 ring-orange-200 rounded-full text-xs font-medium transition-all"
                  >
                    Create Return
                  </button>
                  <button
                    onClick={() => { setExchangeSelectedProductId(''); setShowExchangeModal(true); }}
                    className="px-4 py-2 bg-white hover:bg-violet-50 text-violet-700 ring-1 ring-violet-200 rounded-full text-xs font-medium transition-all"
                  >
                    Create Exchange
                  </button>
                  {selectedOrder.financial_status === 'pending' && (
                    <>
                      <button
                        onClick={() => setShowModifyAddressModal(true)}
                        className="px-4 py-2 bg-white hover:bg-sky-50 text-sky-700 ring-1 ring-sky-200 rounded-full text-xs font-medium transition-all"
                      >
                        Modify Address
                      </button>
                      <button
                        onClick={() => setShowModifyItemsModal(true)}
                        className="px-4 py-2 bg-white hover:bg-sky-50 text-sky-700 ring-1 ring-sky-200 rounded-full text-xs font-medium transition-all"
                      >
                        Modify Items
                      </button>
                      <button
                        onClick={() => setShowModifyPaymentModal(true)}
                        className="px-4 py-2 bg-white hover:bg-sky-50 text-sky-700 ring-1 ring-sky-200 rounded-full text-xs font-medium transition-all"
                      >
                        Modify Payment
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Transactions Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Transactions</h3>
                  <button
                    onClick={() => setShowNewTransactionModal(true)}
                    className="px-3 py-1.5 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-full text-xs font-medium transition-all shadow-sm hover:shadow"
                  >
                    + New Transaction
                  </button>
                </div>
                {selectedOrder.transactions && selectedOrder.transactions.length > 0 ? (
                  <div className="space-y-2">
                    {selectedOrder.transactions.map((transaction) => (
                      <div key={transaction.id} className="p-4 bg-white rounded-xl ring-1 ring-gray-200/70">
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900 text-sm capitalize">{transaction.kind}<span style={{ marginLeft: '6px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{transaction.id}]</span></span>
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ring-1 ${transaction.status === 'success' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' :
                                transaction.status === 'pending' ? 'bg-amber-50 text-amber-700 ring-amber-200/60' :
                                  transaction.status === 'failure' ? 'bg-red-50 text-red-700 ring-red-200/60' :
                                    'bg-gray-100 text-gray-600 ring-gray-200/60'
                                }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${transaction.status === 'success' ? 'bg-emerald-500' : transaction.status === 'pending' ? 'bg-amber-500' : transaction.status === 'failure' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                {transaction.status}
                              </span>
                              {transaction.test && (
                                <span className="text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 ring-1 ring-sky-200/60">
                                  Test
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {transaction.gateway} · {formatDate(transaction.created_at)}
                            </div>
                            {transaction.message && (
                              <div className="text-xs text-gray-400 mt-1">{transaction.message}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900 text-sm tabular-nums">
                              {formatCurrency(transaction.amount)} {transaction.currency}
                            </div>
                            {transaction.authorization && (
                              <div className="text-[10px] text-gray-400 mt-1 font-mono">Auth: {transaction.authorization}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400 text-sm bg-gray-50/50 rounded-2xl">
                    No transactions yet
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Draft Order Detail */}
          {currentView === 'drafts' && selectedDraft && (
            <div className="p-8 max-w-4xl">
              <div className="flex items-center justify-between mb-4 gap-4">
                <h2 className="text-[26px] leading-tight font-semibold text-gray-900 tracking-tight">
                  {selectedDraft.name || `Draft ${selectedDraft.id.slice(0, 8)}`}<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedDraft.id}]</span>
                </h2>

                <button
                  onClick={() => {
                    setEditingDraft(selectedDraft)
                    setShowEditDraftModal(true)

                    const firstProduct = products[0] || null
                    setEditDraftProduct(firstProduct)
                    setEditDraftVariantId(firstProduct?.variants?.[0]?.id || '')
                    const firstItem = selectedDraft.line_items?.[0]
                    setEditDraftProductId(firstItem?.product_id || products[0]?.id || '')
                    setEditDraftVariantId(firstItem?.variant_id || products[0]?.variants?.[0]?.id || '')

                  }}
                  className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 ring-1 ring-gray-200 rounded-full transition-all text-xs font-medium"
                >
                  Edit Draft
                </button>
              </div>
              <div className="mb-8">
                <div className="flex gap-2 mb-2">
                  <span className={`text-xs font-medium tracking-wide px-3 py-1 rounded-full ring-1 ${selectedDraft.status === 'open' ? 'bg-amber-50 text-amber-700 ring-amber-200/60' :
                    selectedDraft.status === 'completed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' :
                      'bg-sky-50 text-sky-700 ring-sky-200/60'
                    }`}>
                    {selectedDraft.status}
                  </span>
                </div>
                <p className="text-gray-500 text-sm">Created {formatDate(selectedDraft.created_at)}</p>
              </div>

              {selectedDraft.customer && (
                <div className="mb-8">
                  <h3 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Customer</h3>
                  <div className="text-gray-900 text-sm font-medium">
                    {selectedDraft.customer.first_name} {selectedDraft.customer.last_name}{selectedDraft.customer.id && <span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedDraft.customer.id}]</span>}
                  </div>
                  <div className="text-gray-500 text-sm">{selectedDraft.customer.email}</div>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-3">Items</h3>
                <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden divide-y divide-gray-100">
                  {selectedDraft.line_items.map((item, index) => (
                    <div key={item.id || index} className="flex justify-between items-center p-4 hover:bg-gray-50/40 transition-colors">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{item.title}{item.id && <span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{item.id}]</span>}</div>
                        <div className="text-xs text-gray-500 mt-0.5">Quantity: {item.quantity}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900 text-sm tabular-nums">
                          {formatCurrency(item.price)}
                        </div>
                        <div className="text-xs text-gray-500 tabular-nums">
                          {formatCurrency((parseFloat(item.price) * item.quantity).toString())}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#4338CA]/5 to-[#C2410C]/5 ring-1 ring-[#4338CA]/15 rounded-2xl px-5 py-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 tracking-tight">Total</span>
                  <span className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight">{formatCurrency(selectedDraft.total_price)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Discount Detail */}
          {currentView === 'discounts' && selectedDiscount && (
            <div className="p-8 max-w-3xl">
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <h2 className="text-[26px] leading-tight font-semibold text-gray-900 tracking-tight">{selectedDiscount.title}<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedDiscount.id}]</span></h2>
                  <button
                    onClick={() => deleteDiscountCode(selectedDiscount.id)}
                    className="px-4 py-2 bg-white hover:bg-red-50 text-red-700 ring-1 ring-red-200 rounded-full text-xs font-medium transition-all"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex gap-2 mb-4">
                  <span className="text-xs font-medium tracking-wide px-3 py-1 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 rounded-full">
                    {selectedDiscount.value_type === 'percentage' ? `${selectedDiscount.value}% off` : `$${selectedDiscount.value} off`}
                  </span>
                  <span className="text-xs font-medium tracking-wide px-3 py-1 bg-gray-100 text-gray-600 rounded-full">
                    {selectedDiscount.value_type}
                  </span>
                </div>
                {selectedDiscount.description && (
                  <p className="text-gray-600 text-sm">{selectedDiscount.description}</p>
                )}
              </div>

              <div className="bg-white p-6 rounded-2xl ring-1 ring-gray-200/70 shadow-[0_1px_2px_rgba(15,15,40,0.04)]">
                <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-1">Apply to Draft Order</h3>
                <p className="text-xs text-gray-500 mb-4">Create a new draft order with this discount applied.</p>
                <form onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  const draftData = {
                    email: formData.get('disc_email') as string,
                    line_items: [{
                      title: formData.get('disc_item_title') as string,
                      price: formData.get('disc_item_price') as string,
                      quantity: parseInt(formData.get('disc_item_qty') as string)
                    }]
                  }
                  createDraftWithDiscount(draftData, selectedDiscount)
                }}>
                  <div className="space-y-3">
                    <input name="disc_email" type="email" placeholder="Customer email" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                    <input name="disc_item_title" placeholder="Item title" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                    <div className="grid grid-cols-2 gap-3">
                      <input name="disc_item_price" type="number" step="0.01" placeholder="Price" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                      <input name="disc_item_qty" type="number" min="1" defaultValue="1" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                    </div>
                  </div>
                  <button type="submit" className="mt-4 px-4 py-2.5 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">
                    Create Draft with Discount
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Collection Detail */}
          {currentView === 'collections' && selectedCollection && (
            <div className="p-8 max-w-4xl">
              <div className="mb-8">
                <h2 className="text-[26px] leading-tight font-semibold text-gray-900 tracking-tight mb-3">{selectedCollection.title}<span style={{ marginLeft: '8px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{selectedCollection.id}]</span></h2>
                <div className="flex gap-2 mb-4">
                  <span className="text-xs font-medium tracking-wide px-3 py-1 bg-gray-100 text-gray-600 rounded-full">
                    {selectedCollection.collection_type || 'manual'}
                  </span>
                  <span className="text-xs font-medium tracking-wide px-3 py-1 bg-sky-50 text-sky-700 ring-1 ring-sky-200/60 rounded-full">
                    {collectionProducts.length} products
                  </span>
                </div>
                {selectedCollection.body_html && (
                  <p className="text-gray-600 text-sm">{selectedCollection.body_html.replace(/<[^>]*>/g, '')}</p>
                )}
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-3">Products in Collection</h3>
                {collectionProducts.length > 0 ? (
                  <div className="space-y-2">
                    {collectionProducts.map((product) => (
                      <div
                        key={product.id}
                        className="group p-4 bg-white rounded-xl ring-1 ring-gray-200/70 hover:ring-[#4338CA]/40 hover:shadow-[0_2px_8px_rgba(67,56,202,0.08)] transition-all cursor-pointer"
                        onClick={() => {
                          setCurrentView('products')
                          loadProductDetails(product.id)
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{product.title}<span style={{ marginLeft: '8px', fontSize: '10px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #aaa)', fontWeight: 400 }}>[{product.id}]</span></div>
                            <div className="text-xs text-gray-500 mt-0.5">{product.vendor}</div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] font-medium tracking-wide px-2 py-0.5 rounded-full ${product.status === 'active' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' : 'bg-gray-100 text-gray-600'}`}>
                              {product.status}
                            </span>
                            <div className="text-[11px] text-gray-400 mt-1.5">
                              {product.variants?.length || 0} variants
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No products in this collection</p>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!selectedCustomer && !selectedProduct && !selectedOrder && !selectedDraft && !selectedDiscount && !selectedCollection && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm px-8">
                <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-[#4338CA]/10 to-[#C2410C]/10 ring-1 ring-[#4338CA]/15 flex items-center justify-center mb-5">
                  <svg className="h-7 w-7 text-[#4338CA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2l-2 4v14a2 2 0 002 2h12a2 2 0 002-2V6l-2-4z" /><line x1="4" y1="6" x2="20" y2="6" /><path d="M16 10a4 4 0 01-8 0" /></svg>
                </div>
                <p className="text-gray-700 text-base font-medium tracking-tight">Select an item to view details</p>
                <p className="text-gray-400 text-sm mt-1">Choose a record from the list to see its full information.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Address Modal */}
      {showAddAddressModal && selectedCustomer && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddAddressModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[500px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Add Address</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              addCustomerAddress({
                first_name: formData.get('first_name') as string,
                last_name: formData.get('last_name') as string,
                address1: formData.get('address1') as string,
                address2: formData.get('address2') as string,
                city: formData.get('city') as string,
                province: formData.get('province') as string,
                country: formData.get('country') as string,
                zip: formData.get('zip') as string,
                phone: formData.get('phone') as string
              })
            }}>
              <div className="space-y-3">
                <input name="first_name" placeholder="First Name" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="last_name" placeholder="Last Name" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="address1" placeholder="Address Line 1" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="address2" placeholder="Address Line 2" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="city" placeholder="City" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="province" placeholder="Province/State" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="country" placeholder="Country" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="zip" placeholder="Postal/Zip Code" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="phone" placeholder="Phone" type="tel" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowAddAddressModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">
                  Add Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Address Modal */}
      {showEditAddressModal && selectedCustomer && editingAddress && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowEditAddressModal(false)
          setEditingAddress(null)
        }}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[500px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Edit Address</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              updateCustomerAddress({
                first_name: formData.get('first_name') as string,
                last_name: formData.get('last_name') as string,
                address1: formData.get('address1') as string,
                address2: formData.get('address2') as string,
                city: formData.get('city') as string,
                province: formData.get('province') as string,
                country: formData.get('country') as string,
                zip: formData.get('zip') as string,
                phone: formData.get('phone') as string
              })
            }}>
              <div className="space-y-3">
                <input name="first_name" placeholder="First Name" defaultValue={editingAddress.first_name} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="last_name" placeholder="Last Name" defaultValue={editingAddress.last_name} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="address1" placeholder="Address Line 1" defaultValue={editingAddress.address1} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="address2" placeholder="Address Line 2" defaultValue={editingAddress.address2} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="city" placeholder="City" defaultValue={editingAddress.city} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="province" placeholder="Province/State" defaultValue={editingAddress.province} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="country" placeholder="Country" defaultValue={editingAddress.country} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="zip" placeholder="Postal/Zip Code" defaultValue={editingAddress.zip} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="phone" placeholder="Phone" type="tel" defaultValue={editingAddress.phone} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => {
                  setShowEditAddressModal(false)
                  setEditingAddress(null)
                }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">
                  Update Address
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showNewOrderModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => {
          setShowNewOrderModal(false)
          setSelectedOrderProduct(null)
          setSelectedVariantId('')
        }}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Create New Order</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              if (!selectedOrderProduct) {
                alert('Please select a product')
                return
              }

              const selectedVariant = selectedOrderProduct.variants.find(v => v.id === selectedVariantId) || selectedOrderProduct.variants[0]

              const orderData = {
                email: formData.get('email') as string,
                financial_status: formData.get('financial_status') as string || 'pending',
                line_items: [{
                  title: selectedOrderProduct.title,
                  price: selectedVariant.price,
                  quantity: parseInt(formData.get('item_quantity') as string),
                  admin_graphql_api_id: '',
                  sku: selectedVariant.sku || '',
                  variant_title: selectedVariant.title || 'Default',
                  name: selectedOrderProduct.title,
                  fulfillable_quantity: parseInt(formData.get('item_quantity') as string),
                  vendor: selectedOrderProduct.vendor || '',
                  product_id: selectedOrderProduct.id,
                  variant_id: selectedVariant.id
                }]
              }

              createOrder(orderData)
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Customer Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="customer@example.com"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Financial Status</label>
                  <select
                    name="financial_status"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="authorized">Authorized</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-3">Line Item</h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Product</label>
                      <select
                        value={selectedOrderProduct?.id || ''}
                        onChange={(e) => {
                          const product = products.find(p => p.id === e.target.value)
                          setSelectedOrderProduct(product || null)
                          setSelectedVariantId(product?.variants[0]?.id || '')
                        }}
                        required
                        className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                      >
                        <option value="">Select a product...</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedOrderProduct && selectedOrderProduct.variants.length > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Variant</label>
                        <select
                          value={selectedVariantId}
                          onChange={(e) => setSelectedVariantId(e.target.value)}
                          required
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        >
                          {selectedOrderProduct.variants.map(variant => (
                            <option key={variant.id} value={variant.id}>
                              {variant.title} - {formatCurrency(variant.price)} {variant.sku ? `(SKU: ${variant.sku})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {selectedOrderProduct && (
                      <div className="p-3.5 bg-gray-50 rounded-xl ring-1 ring-gray-200/60 text-xs">
                        <div className="grid grid-cols-2 gap-2 text-gray-700">
                          <div><span className="font-medium">Price:</span> {formatCurrency(selectedOrderProduct.variants.find(v => v.id === selectedVariantId)?.price || selectedOrderProduct.variants[0]?.price || '0')}</div>
                          <div><span className="font-medium">Vendor:</span> {selectedOrderProduct.vendor || 'N/A'}</div>
                          {selectedOrderProduct.variants.find(v => v.id === selectedVariantId)?.sku && (
                            <div><span className="font-medium">SKU:</span> {selectedOrderProduct.variants.find(v => v.id === selectedVariantId)?.sku}</div>
                          )}
                          <div><span className="font-medium">Inventory:</span> {selectedOrderProduct.variants.find(v => v.id === selectedVariantId)?.inventory_quantity || 0}</div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                      <input
                        name="item_quantity"
                        type="number"
                        min="1"
                        defaultValue="1"
                        required
                        className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewOrderModal(false)
                    setSelectedOrderProduct(null)
                    setSelectedVariantId('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all"
                >
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Draft Modal */}
      {showNewDraftModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewDraftModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Create New Draft Order</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              const draftData: any = {
                email: formData.get('email') as string,
                note: formData.get('note') as string,
                line_items: [{
                  title: formData.get('item_title') as string,
                  price: formData.get('item_price') as string,
                  quantity: parseInt(formData.get('item_quantity') as string)
                }]
              }

              // Add discount if selected
              const discountId = formData.get('draft_discount') as string
              if (discountId) {
                const disc = discountCodes.find(d => d.id === discountId)
                if (disc) {
                  draftData.applied_discount = {
                    title: disc.title,
                    description: disc.description || '',
                    value: disc.value,
                    value_type: disc.value_type,
                    amount: disc.value_type === 'fixed_amount' ? disc.value : '0'
                  }
                }
              }

              createDraftOrder(draftData)
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Customer Email</label>
                  <input
                    name="email"
                    type="email"
                    placeholder="customer@example.com"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Note (Optional)</label>
                  <textarea
                    name="note"
                    placeholder="Add a note..."
                    rows={3}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                </div>

                {discountCodes.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Apply Discount (optional)</label>
                    <select name="draft_discount" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all">
                      <option value="">No discount</option>
                      {discountCodes.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.title} ({d.value_type === 'percentage' ? `${d.value}%` : `$${d.value}`} off)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-3">Line Item</h4>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Item Title</label>
                      <input
                        name="item_title"
                        placeholder="Product name"
                        required
                        className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Price</label>
                        <input
                          name="item_price"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          required
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                        <input
                          name="item_quantity"
                          type="number"
                          min="1"
                          defaultValue="1"
                          required
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowNewDraftModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all"
                >
                  Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditDraftModal && editingDraft && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 overflow-y-auto"
          onClick={() => {
            setShowEditDraftModal(false)
            setEditingDraft(null)
          }}
        >
          <div className="min-h-full px-4 py-6 flex items-start justify-center">

            <div
              className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] ring-1 ring-gray-200/70 p-6 w-full max-w-[600px] max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Edit Draft Order</h3>

              <p className="text-sm text-gray-600 mb-4">
                Draft line items must be linked to a product variant for updates. Select a product and variant below.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)

                  const selectedProduct = products.find(p => p.id === editDraftProductId) || null
                  const selectedVariant = selectedProduct?.variants.find(v => v.id === editDraftVariantId) || null

                  if (!selectedProduct || !selectedVariant) {
                    alert('Please select a product and variant.')
                    return
                  }

                  const draftData = {
                    email: formData.get('email') as string,
                    note: formData.get('note') as string,
                    line_items: [{
                      title: formData.get('item_title') as string,
                      price: formData.get('item_price') as string,
                      quantity: parseInt(formData.get('item_quantity') as string, 10),
                      product_id: selectedProduct.id,
                      variant_id: selectedVariant.id
                    }]
                  }

                  updateDraftOrder(editingDraft.id, draftData)
                }}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Customer Email</label>
                    <input
                      name="email"
                      type="email"
                      defaultValue={editingDraft.email || ''}
                      required
                      className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Note (Optional)</label>
                    <textarea
                      name="note"
                      defaultValue={(editingDraft as any).note || ''}
                      rows={3}
                      className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                    />
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-3">Product & Variant (required)</h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Product</label>
                        <select
                          value={editDraftProductId}
                          onChange={(e) => {
                            const newProductId = e.target.value
                            setEditDraftProductId(newProductId)
                            const p = products.find(x => x.id === newProductId)
                            setEditDraftVariantId(p?.variants?.[0]?.id || '')
                          }}
                          required
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        >
                          <option value="">Select a product...</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Variant</label>
                        <select
                          value={editDraftVariantId}
                          onChange={(e) => setEditDraftVariantId(e.target.value)}
                          required
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                          disabled={!editDraftProductId}
                        >
                          {(() => {
                            const p = products.find(x => x.id === editDraftProductId)
                            const variants = p?.variants || []
                            if (variants.length === 0) {
                              return <option value="">No variants available</option>
                            }
                            return variants.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.title} - {formatCurrency(v.price)}{v.sku ? ` (SKU: ${v.sku})` : ''}
                              </option>
                            ))
                          })()}
                        </select>
                      </div>

                      {(() => {
                        const p = products.find(x => x.id === editDraftProductId)
                        const v = p?.variants.find(x => x.id === editDraftVariantId)
                        if (!p || !v) return null
                        return (
                          <div className="p-3.5 bg-gray-50 rounded-xl ring-1 ring-gray-200/60 text-xs">
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><span className="font-medium">Vendor:</span> {p.vendor || 'N/A'}</div>
                              <div><span className="font-medium">Price:</span> {formatCurrency(v.price)}</div>
                              <div><span className="font-medium">Inventory:</span> {v.inventory_quantity}</div>
                              <div><span className="font-medium">Variant:</span> {v.title}</div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-3">Line Item</h4>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Item Title</label>
                        <input
                          name="item_title"
                          defaultValue={editingDraft.line_items?.[0]?.title || ''}
                          required
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        />
                      </div>

                      {(() => {
                        const p = products.find(x => x.id === editDraftProductId)
                        const v = p?.variants.find(x => x.id === editDraftVariantId)

                        return (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Price</label>
                              <input
                                name="item_price"
                                type="number"
                                step="0.01"
                                value={v?.price ?? '0.00'}
                                readOnly
                                className="w-full px-3 py-2.5 bg-gray-100 border border-transparent rounded-lg text-sm text-gray-700 cursor-not-allowed"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                Price is derived from the selected variant in this simulator.
                              </p>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                              <input
                                name="item_quantity"
                                type="number"
                                min="1"
                                defaultValue={String(editingDraft.line_items?.[0]?.quantity || 1)}
                                required
                                className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                              />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditDraftModal(false)
                      setEditingDraft(null)
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}


      {/* New Transaction Modal */}
      {showNewTransactionModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewTransactionModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Create Transaction</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              const transactionData = {
                kind: formData.get('kind') as string,
                gateway: formData.get('gateway') as string,
                amount: formData.get('amount') as string,
                currency: formData.get('currency') as string || selectedOrder.total_price.split(' ')[1] || 'USD',
                test: formData.get('test') === 'true'
              }

              createTransaction(transactionData)
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Transaction Kind</label>
                  <select
                    name="kind"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  >
                    <option value="">Select kind...</option>
                    <option value="authorization">Authorization</option>
                    <option value="capture">Capture</option>
                    <option value="sale">Sale</option>
                    <option value="void">Void</option>
                    <option value="refund">Refund</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Authorization: Reserve funds | Capture: Charge reserved funds | Sale: Immediate charge | Void: Cancel authorization | Refund: Return funds
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Payment Gateway</label>
                  <input
                    name="gateway"
                    type="text"
                    placeholder="e.g., manual, strope, shopster_payments"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use "manual" for manual payments or specify your payment gateway
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount</label>
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={selectedOrder.total_price}
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Currency</label>
                  <input
                    name="currency"
                    type="text"
                    placeholder="USD"
                    defaultValue="USD"
                    required
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      name="test"
                      type="checkbox"
                      value="true"
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Test Transaction</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowNewTransactionModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all"
                >
                  Create Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Return Modal */}
      {showReturnModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReturnModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Create Return</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const returnItems: any[] = []

              selectedOrder.line_items.forEach((item, index) => {
                const qty = parseInt(formData.get(`return_qty_${index}`) as string || '0')
                if (qty > 0) {
                  returnItems.push({
                    fulfillment_line_item_id: item.fulfillment_line_item_id || item.id,
                    quantity: qty,
                    return_reason: formData.get(`return_reason_${index}`) as string || 'OTHER',
                    return_reason_note: formData.get(`return_note_${index}`) as string || undefined
                  })
                }
              })

              if (returnItems.length === 0) {
                alert('Please select at least one item to return')
                return
              }

              createReturn({ return_line_items: returnItems })
            }}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Select items to return and specify quantities.</p>
                {selectedOrder.line_items.map((item, index) => (
                  <div key={item.id} className="p-4 bg-gray-50/40 rounded-xl ring-1 ring-gray-200/60 space-y-3">
                    <div className="flex justify-between">
                      <div className="font-medium text-gray-900">{item.title}</div>
                      <div className="text-gray-600">Max: {item.quantity}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-1.5">Quantity</label>
                        <input
                          name={`return_qty_${index}`}
                          type="number"
                          min="0"
                          max={item.quantity}
                          defaultValue="0"
                          className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-1.5">Reason</label>
                        <select name={`return_reason_${index}`} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all">
                          <option value="OTHER">Other</option>
                          <option value="DAMAGED_OR_DEFECTIVE">Damaged/Defective</option>
                          <option value="NOT_AS_DESCRIBED">Not as Described</option>
                          <option value="WRONG_ITEM_SENT">Wrong Item Sent</option>
                          <option value="SIZE_TOO_SMALL">Size Too Small</option>
                          <option value="SIZE_TOO_LARGE">Size Too Large</option>
                          <option value="STYLE_NOT_AS_EXPECTED">Style Not as Expected</option>
                          <option value="COLOR_NOT_AS_EXPECTED">Color Not as Expected</option>
                          <option value="CHANGED_MIND">Changed Mind</option>
                          <option value="UNWANTED_GIFT">Unwanted Gift</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-1.5">Note (optional)</label>
                      <input name={`return_note_${index}`} type="text" placeholder="Additional details..." className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowReturnModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#C2410C] hover:bg-[#A23409] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">
                  Create Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Exchange Modal */}
      {showExchangeModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowExchangeModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Create Exchange</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              // Return items
              const returnItems: any[] = []
              selectedOrder.line_items.forEach((item, index) => {
                const qty = parseInt(formData.get(`exchange_return_qty_${index}`) as string || '0')
                if (qty > 0) {
                  returnItems.push({
                    fulfillment_line_item_id: item.fulfillment_line_item_id || item.id,
                    quantity: qty
                  })
                }
              })

              if (returnItems.length === 0) {
                alert('Please select at least one item to return')
                return
              }

              // New items
              const newProductId = formData.get('new_product_id') as string
              const newVariantId = formData.get('new_variant_id') as string
              const newQty = parseInt(formData.get('new_quantity') as string || '1')

              if (!newProductId || !newVariantId) {
                alert('Please select a replacement product and variant')
                return
              }

              const newProduct = products.find(p => p.id === newProductId)
              const newVariant = newProduct?.variants.find(v => v.id === newVariantId)

              createExchange({
                return_line_items: returnItems,
                new_line_items: [{
                  variant_id: newVariantId,
                  product_id: newProductId,
                  quantity: newQty,
                  title: newProduct?.title || '',
                  price: newVariant?.price || '0'
                }],
                exchange_reason: formData.get('exchange_reason') as string || undefined,
                exchange_note: formData.get('exchange_note') as string || undefined,
                restock_returned_items: formData.get('restock') === 'true'
              })
            }}>
              <div className="space-y-4">
                <div>
                  <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-3">Items to Return</h4>
                  {selectedOrder.line_items.map((item, index) => (
                    <div key={item.id} className="p-3 bg-gray-50/40 rounded-xl ring-1 ring-gray-200/60 mb-2">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-gray-900">{item.title}</span>
                        <span className="text-gray-600">Max: {item.quantity}</span>
                      </div>
                      <input
                        name={`exchange_return_qty_${index}`}
                        type="number"
                        min="0"
                        max={item.quantity}
                        defaultValue="0"
                        className="w-24 px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                        placeholder="Qty"
                      />
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-3">Replacement Item</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Product</label>
                      <select name="new_product_id" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" onChange={(e) => setExchangeSelectedProductId(e.target.value)}>
                        <option value="">Select product...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Variant</label>
                      <select name="new_variant_id" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all">
                        <option value="">Select variant...</option>
                        {products.filter(p => p.id === exchangeSelectedProductId).flatMap(p => p.variants?.map(v => (
                          <option key={v.id} value={v.id}>{v.title} ({formatCurrency(v.price)})</option>
                        )) || [])}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                      <input name="new_quantity" type="number" min="1" defaultValue="1" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Exchange Reason (optional)</label>
                    <input name="exchange_reason" type="text" placeholder="Reason for exchange" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Exchange Note (optional)</label>
                    <textarea name="exchange_note" rows={2} placeholder="Additional notes..." className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                  </div>
                  <label className="flex items-center gap-2">
                    <input name="restock" type="checkbox" value="true" defaultChecked className="rounded" />
                    <span className="text-sm text-gray-700">Restock returned items</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowExchangeModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">
                  Create Exchange
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modify Pending Order Address Modal */}
      {showModifyAddressModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModifyAddressModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[500px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Modify Shipping Address</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              modifyPendingOrderAddress({
                first_name: formData.get('first_name') as string || undefined,
                last_name: formData.get('last_name') as string || undefined,
                address1: formData.get('address1') as string,
                address2: formData.get('address2') as string || undefined,
                city: formData.get('city') as string,
                province: formData.get('province') as string || undefined,
                country: formData.get('country') as string,
                zip: formData.get('zip') as string,
                phone: formData.get('phone') as string || undefined
              })
            }}>
              <div className="space-y-3">
                <input name="first_name" placeholder="First Name" defaultValue={selectedOrder.shipping_address?.first_name || ''} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="last_name" placeholder="Last Name" defaultValue={selectedOrder.shipping_address?.last_name || ''} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="address1" placeholder="Address Line 1" defaultValue={selectedOrder.shipping_address?.address1 || ''} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="address2" placeholder="Address Line 2" defaultValue={selectedOrder.shipping_address?.address2 || ''} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="city" placeholder="City" defaultValue={selectedOrder.shipping_address?.city || ''} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="province" placeholder="Province/State" defaultValue={selectedOrder.shipping_address?.province || ''} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="country" placeholder="Country" defaultValue={selectedOrder.shipping_address?.country || ''} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="zip" placeholder="Postal/Zip Code" defaultValue={selectedOrder.shipping_address?.zip || ''} required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                <input name="phone" placeholder="Phone" defaultValue={selectedOrder.shipping_address?.phone || ''} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModifyAddressModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">Update Address</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modify Pending Order Items Modal */}
      {showModifyItemsModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModifyItemsModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Modify Order Items</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              const lineItems: any[] = []
              selectedOrder.line_items.forEach((item, index) => {
                const qty = parseInt(formData.get(`modify_qty_${index}`) as string || String(item.quantity))
                if (item.variant_id) {
                  lineItems.push({
                    variant_id: item.variant_id,
                    quantity: qty
                  })
                }
              })

              modifyPendingOrderItems({
                line_items: lineItems.length > 0 ? lineItems : undefined,
                note: formData.get('note') as string || undefined,
                tags: formData.get('tags') as string || undefined
              })
            }}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Adjust quantities for line items. Set quantity to 0 to remove an item.</p>
                {selectedOrder.line_items.map((item, index) => (
                  <div key={item.id} className="p-3 bg-gray-50/40 rounded-xl ring-1 ring-gray-200/60 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-gray-900">{item.title}</div>
                      <div className="text-sm text-gray-600">Current qty: {item.quantity}</div>
                      {!item.variant_id && <div className="text-xs text-red-500">No variant ID - cannot modify</div>}
                    </div>
                    <input
                      name={`modify_qty_${index}`}
                      type="number"
                      min="0"
                      defaultValue={item.quantity}
                      disabled={!item.variant_id}
                      className="w-24 px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Note (optional)</label>
                  <input name="note" type="text" placeholder="Order note" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Tags (optional)</label>
                  <input name="tags" type="text" placeholder="Comma-separated tags" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModifyItemsModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">Update Items</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modify Pending Order Payment Modal */}
      {showModifyPaymentModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModifyPaymentModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[600px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Modify Order Payment</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)

              const transactions = [{
                id: formData.get('transaction_id') as string,
                amount: formData.get('amount') as string,
                kind: formData.get('kind') as string,
                gateway: formData.get('gateway') as string,
                status: formData.get('status') as string,
                currency: formData.get('currency') as string || 'USD'
              }]

              modifyPendingOrderPayment(transactions)
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Transaction ID</label>
                  <input name="transaction_id" type="text" required placeholder="Transaction ID" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount</label>
                  <input name="amount" type="number" step="0.01" required placeholder={selectedOrder.total_price} className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Kind</label>
                  <select name="kind" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all">
                    <option value="sale">Sale</option>
                    <option value="capture">Capture</option>
                    <option value="authorization">Authorization</option>
                    <option value="void">Void</option>
                    <option value="refund">Refund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Gateway</label>
                  <input name="gateway" type="text" required placeholder="e.g., manual, strope" className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
                  <select name="status" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all">
                    <option value="success">Success</option>
                    <option value="pending">Pending</option>
                    <option value="failure">Failure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Currency</label>
                  <input name="currency" type="text" defaultValue="USD" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowModifyPaymentModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">Update Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer to Human Agent Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowTransferModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[500px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Transfer to Human Agent</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              const summary = formData.get('summary') as string
              if (!summary.trim()) {
                alert('Please provide a summary of the issue')
                return
              }
              transferToHuman(summary)
            }}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Provide a summary of the issue that needs human attention. This will escalate the case to a human support agent.
                </p>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Issue Summary</label>
                  <textarea
                    name="summary"
                    rows={4}
                    required
                    placeholder="Describe the issue that needs human attention..."
                    className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Address Lookup Modal */}
      {showAddressLookupModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddressLookupModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[500px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Address Lookup</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Customer ID</label>
                <input
                  type="text"
                  value={addressLookupCustomerId}
                  onChange={(e) => setAddressLookupCustomerId(e.target.value)}
                  placeholder="Enter customer ID"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Address ID (optional, leave empty to list all)</label>
                <input
                  type="text"
                  value={addressLookupAddressId}
                  onChange={(e) => setAddressLookupAddressId(e.target.value)}
                  placeholder="Enter address ID (optional)"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!addressLookupCustomerId) { alert('Customer ID is required'); return }
                    if (addressLookupAddressId) {
                      lookupAddress(addressLookupCustomerId, addressLookupAddressId)
                    } else {
                      loadCustomerAddresses(addressLookupCustomerId)
                    }
                  }}
                  className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all"
                >
                  Lookup
                </button>
              </div>

              {addressLookupResult && (
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-[11px] font-medium tracking-wider uppercase text-gray-400 mb-2">Result</h4>
                  <pre className="text-[11px] font-mono bg-gray-50 p-3 rounded-lg overflow-auto max-h-60 text-gray-700 ring-1 ring-gray-200/60">
                    {JSON.stringify(addressLookupResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddressLookupModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Discount Modal */}
      {showNewDiscountModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewDiscountModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,15,40,0.25)] p-6 w-[500px] max-h-[85vh] overflow-y-auto ring-1 ring-gray-200/70" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-5 text-gray-900 tracking-tight">Create Discount Code</h3>
            <form onSubmit={(e) => {
              e.preventDefault()
              const formData = new FormData(e.currentTarget)
              addDiscountCode({
                id: '',
                title: formData.get('discount_title') as string,
                value: formData.get('discount_value') as string,
                value_type: formData.get('discount_type') as 'fixed_amount' | 'percentage',
                description: formData.get('discount_description') as string || undefined
              })
              setShowNewDiscountModal(false)
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Discount Code / Title</label>
                  <input name="discount_title" placeholder="e.g., SUMMER20" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Discount Type</label>
                  <select name="discount_type" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all">
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Value</label>
                  <input name="discount_value" type="number" step="0.01" min="0" placeholder="e.g., 20" required className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Description (optional)</label>
                  <textarea name="discount_description" rows={2} placeholder="Discount description..." className="w-full px-3 py-2.5 bg-gray-50 border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-[#4338CA]/40 focus:ring-4 focus:ring-[#4338CA]/10 transition-all" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowNewDiscountModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-[#4338CA] hover:bg-[#3F35BF] text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all">Create Discount</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
