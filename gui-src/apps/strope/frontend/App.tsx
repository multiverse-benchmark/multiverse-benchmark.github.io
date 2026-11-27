import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useBackendAPI } from '@shared/hooks/useBackendAPI'

const APP_NAME = "Strope"

// Type Definitions
interface Customer {
  id: string
  name: string
  email: string | null
  created: number
  livemode: boolean
}

interface Product {
  id: string
  name: string
  description: string | null
  active: boolean
  created: number
  livemode: boolean
}

interface Price {
  id: string
  product: string
  currency: string
  unit_amount: number
  active: boolean
  created: number
  livemode: boolean
  type?: string
  recurring?: {
    interval: string
    interval_count: number
  }
}

interface PaymentIntent {
  id: string
  amount: number
  currency: string
  status: string
  customer: string | null
  created: number
  payment_method_types?: string[]
}

interface InvoiceLineItem {
  id: string
  amount: number
  currency: string
  description: string | null
  quantity: number
}

interface Invoice {
  id: string
  customer: string
  amount_due: number
  amount_paid: number
  amount_remaining: number
  currency: string
  status: string
  created: number
  due_date?: number
  lines?: {
    data: InvoiceLineItem[]
  }
}

interface Subscription {
  id: string
  customer: string
  status: string
  current_period_start: number
  current_period_end: number
  created: number
  items: {
    data: Array<{
      id: string
      quantity?: number
      price: {
        id: string
        product: string
        unit_amount: number
        currency: string
      }
    }>
  }
}

interface Coupon {
  id: string
  name?: string
  percent_off: number | null
  amount_off: number | null
  currency: string | null
  duration: string
  created: number
}

interface Dispute {
  id: string
  charge: string
  amount: number
  currency: string
  status: string
  reason: string
  created: number
  payment_intent?: string
}

interface Balance {
  available: Array<{ amount: number; currency: string }>
  pending: Array<{ amount: number; currency: string }>
}

// Shared utility: format cent amounts as currency
const formatAmount = (cents: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

type Tab = 'overview' | 'customers' | 'products' | 'payments' | 'invoices' | 'subscriptions' | 'coupons' | 'disputes'

interface AppProps {
  onClose: () => void
  setRefreshHandler?: (handler: (() => void) | null) => void
  openWindow?: (config: any) => void
}

export default function StropeApp({ setRefreshHandler }: AppProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadDataRef = useRef<() => void>(() => {})
  const setRefreshHandlerRef = useRef(setRefreshHandler)
  setRefreshHandlerRef.current = setRefreshHandler

  const api = useBackendAPI('strope')

  useEffect(() => {
    const handler = () => loadDataRef.current()
    setRefreshHandlerRef.current?.(handler)
    return () => {
      setRefreshHandlerRef.current?.(null)
    }
  }, [])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'customers', label: 'Customers', icon: '👥' },
    { id: 'products', label: 'Products', icon: '📦' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'invoices', label: 'Invoices', icon: '📄' },
    { id: 'subscriptions', label: 'Subscriptions', icon: '🔄' },
    { id: 'coupons', label: 'Coupons', icon: '🎟️' },
    { id: 'disputes', label: 'Disputes', icon: '⚠️' },
  ]

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Strope-style Header */}
      <div className="bg-cyan-700 text-white px-5 py-5 shadow-md border-b-2 border-slate-800">
        <h1 className="text-2xl font-semibold tracking-tight">{`${APP_NAME} Dashboard`}</h1>
        <p className="text-sm opacity-80 mt-1.5">Manage your payments and billing</p>
      </div>

      {/* Main content with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        <div className="w-64 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] overflow-y-auto">
          <div className="p-4 space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`w-full px-4 py-3 text-left text-sm font-medium rounded-lg transition-all flex items-center gap-3 ${
                  activeTab === tab.id
                    ? 'bg-[#0891B2]/10 text-[#0E7490] border-l-4 border-[#0891B2]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="text-xl">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto bg-[var(--bg-primary)]">
          {error && (
            <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
          
          {activeTab === 'overview' && <OverviewTab api={api} />}
          {activeTab === 'customers' && <CustomersTab api={api} />}
          {activeTab === 'products' && <ProductsTab api={api} />}
          {activeTab === 'payments' && <PaymentsTab api={api} />}
          {activeTab === 'invoices' && <InvoicesTab api={api} />}
          {activeTab === 'subscriptions' && <SubscriptionsTab api={api} />}
          {activeTab === 'coupons' && <CouponsTab api={api} />}
          {activeTab === 'disputes' && <DisputesTab api={api} />}
        </div>
      </div>
    </div>
  )
}

// Overview Tab Component
function OverviewTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [stats, setStats] = useState({
    customers: 0,
    products: 0,
    payments: 0,
    subscriptions: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [balanceData, customersData, productsData, paymentsData, subsData] = await Promise.all([
        api.callTool<Balance>('retrieve_balance', {}),
        api.callTool<{ data: Customer[] }>('list_customers', { limit: 100 }),
        api.callTool<{ data: Product[] }>('list_products', { limit: 100 }),
        api.callTool<{ data: PaymentIntent[] }>('list_payment_intents', { limit: 100 }),
        api.callTool<{ data: Subscription[] }>('list_subscriptions', { limit: 100 }),
      ])

      setBalance(balanceData)
      setStats({
        customers: customersData?.data?.length || 0,
        products: productsData?.data?.length || 0,
        payments: paymentsData?.data?.length || 0,
        subscriptions: subsData?.data?.length || 0,
      })
    } catch (err) {
      // Error loading overview data
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  const formatCurrency = (amount: number, currency: string) => {
    return formatAmount(amount, currency)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Account Overview</h2>
      
      {/* Balance Cards */}
      {balance && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="text-sm opacity-90 mb-2">Available Balance</div>
            <div className="text-3xl font-bold">
              {balance.available.map((bal, idx) => (
                <div key={idx}>{formatCurrency(bal.amount, bal.currency)}</div>
              ))}
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="text-sm opacity-90 mb-2">Pending Balance</div>
            <div className="text-3xl font-bold">
              {balance.pending.map((bal, idx) => (
                <div key={idx}>{formatCurrency(bal.amount, bal.currency)}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="👥" label="Customers" value={stats.customers} color="cyan" />
        <StatCard icon="📦" label="Products" value={stats.products} color="blue" />
        <StatCard icon="💳" label="Payments" value={stats.payments} color="green" />
        <StatCard icon="🔄" label="Subscriptions" value={stats.subscriptions} color="slate" />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number; color?: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-4">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
    </div>
  )
}

// Customers Tab Component
function CustomersTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '' })
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerPayments, setCustomerPayments] = useState<PaymentIntent[]>([])
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([])
  const [customerSubscriptions, setCustomerSubscriptions] = useState<Subscription[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    setLoading(true)
    try {
      const result = await api.callTool<{ data: Customer[] }>('list_customers', { limit: 100 })
      setCustomers(result?.data || [])
    } catch (err) {
      // Error loading customers
    } finally {
      setLoading(false)
    }
  }

  const handleSelectCustomer = async (customer: Customer) => {
    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer(null)
      return
    }
    setSelectedCustomer(customer)
    setProfileLoading(true)
    try {
      const [paymentsData, invoicesData, subsData, pricesData] = await Promise.all([
        api.callTool<{ data: PaymentIntent[] }>('list_payment_intents', { limit: 100 }),
        api.callTool<{ data: Invoice[] }>('list_invoices', { limit: 100 }),
        api.callTool<{ data: Subscription[] }>('list_subscriptions', { limit: 100 }),
        api.callTool<{ data: Price[] }>('list_prices', { limit: 100 }),
      ])
      setCustomerPayments((paymentsData?.data || []).filter(p => p.customer === customer.id))
      setCustomerInvoices((invoicesData?.data || []).filter(i => i.customer === customer.id))
      setCustomerSubscriptions((subsData?.data || []).filter(s => s.customer === customer.id))
      setPrices(pricesData?.data || [])
    } catch (err) {
      // Error loading customer details
    } finally {
      setProfileLoading(false)
    }
  }

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.callTool('create_customer', {
        name: newCustomer.name,
        email: newCustomer.email || null,
      })
      setNewCustomer({ name: '', email: '' })
      setShowCreateForm(false)
      await loadCustomers()
    } catch (err) {
      // Error creating customer
    }
  }

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          {selectedCustomer && (
            <button
              onClick={() => setSelectedCustomer(null)}
              className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
            >
              &larr; All Customers
            </button>
          )}
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            {selectedCustomer ? <>{selectedCustomer.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedCustomer.id}]</span></> : 'Customers'}
          </h2>
        </div>
        {!selectedCustomer && (
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
          >
            {showCreateForm ? 'Cancel' : '+ New Customer'}
          </button>
        )}
      </div>

      {/* Customer Profile View */}
      {selectedCustomer ? (
        <div className="space-y-6">
          {/* Customer Info Card */}
          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] p-6">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-full bg-[#0891B2]/10 flex items-center justify-center text-2xl font-bold text-[#0E7490] flex-shrink-0">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">{selectedCustomer.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{selectedCustomer.id}]</span></h3>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-tertiary)]">Email:</span>
                    <span className="text-[var(--text-secondary)]">{selectedCustomer.email || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-tertiary)]">ID:</span>
                    <span className="text-[var(--text-secondary)] font-mono">{selectedCustomer.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-tertiary)]">Created:</span>
                    <span className="text-[var(--text-secondary)]">{new Date(selectedCustomer.created * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {profileLoading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Payment Methods Section */}
              <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Payment Methods</h3>
                </div>
                {(() => {
                  const methodTypes = new Set<string>()
                  customerPayments.forEach(p => {
                    (p.payment_method_types || ['card']).forEach(t => methodTypes.add(t))
                  })
                  const methods = Array.from(methodTypes)
                  if (methods.length > 0) {
                    return (
                      <div className="p-4 space-y-2">
                        {methods.map(method => (
                          <div key={method} className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                            <div className="w-10 h-10 bg-[#0891B2]/10 rounded-lg flex items-center justify-center text-lg">
                              {method === 'card' ? '💳' : method === 'bank_transfer' ? '🏦' : '💰'}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-[var(--text-primary)]">
                                {method === 'card' ? 'Card' : method.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              </div>
                              <div className="text-xs text-[var(--text-tertiary)]">
                                {customerPayments.filter(p => (p.payment_method_types || ['card']).includes(method)).length} payment(s)
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return <div className="px-6 py-8 text-center text-sm text-[var(--text-tertiary)]">No payment methods</div>
                })()}
              </div>

              {/* Subscriptions Section */}
              <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Subscriptions</h3>
                  <span className="text-sm text-[var(--text-tertiary)]">{customerSubscriptions.length}</span>
                </div>
                {customerSubscriptions.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                      <tr>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Subscription ID</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Status</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Amount</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Period</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerSubscriptions.map(sub => (
                        <tr key={sub.id} className="border-b border-[var(--border-color)]">
                          <td className="px-6 py-3 text-[var(--text-tertiary)] font-mono text-sm">{sub.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{sub.id}]</span></td>
                          <td className="px-6 py-3"><StatusBadge status={sub.status} /></td>
                          <td className="px-6 py-3 text-[var(--text-primary)] text-sm">
                            {sub.items.data.map(item => {
                              const fullPrice = prices.find(p => p.id === item.price.id)
                              const amount = fullPrice?.unit_amount ?? item.price.unit_amount
                              return amount != null ? formatAmount(amount, item.price.currency) : '-'
                            }).join(', ')}
                          </td>
                          <td className="px-6 py-3 text-[var(--text-secondary)] text-sm">
                            {new Date(sub.current_period_start * 1000).toLocaleDateString()} - {new Date(sub.current_period_end * 1000).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-8 text-center text-sm text-[var(--text-tertiary)]">No subscriptions</div>
                )}
              </div>

              {/* Payments Section */}
              <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Payments</h3>
                  <span className="text-sm text-[var(--text-tertiary)]">{customerPayments.length}</span>
                </div>
                {customerPayments.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                      <tr>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Payment ID</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Amount</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Status</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerPayments.map(payment => (
                        <tr key={payment.id} className="border-b border-[var(--border-color)]">
                          <td className="px-6 py-3 text-[var(--text-tertiary)] font-mono text-sm">{payment.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{payment.id}]</span></td>
                          <td className="px-6 py-3 text-[var(--text-primary)] font-medium text-sm">
                            {formatAmount(payment.amount, payment.currency)}
                          </td>
                          <td className="px-6 py-3"><StatusBadge status={payment.status} /></td>
                          <td className="px-6 py-3 text-[var(--text-secondary)] text-sm">
                            {new Date(payment.created * 1000).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-8 text-center text-sm text-[var(--text-tertiary)]">No payments</div>
                )}
              </div>

              {/* Invoices Section */}
              <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Invoices</h3>
                  <span className="text-sm text-[var(--text-tertiary)]">{customerInvoices.length}</span>
                </div>
                {customerInvoices.length > 0 ? (
                  <table className="w-full">
                    <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                      <tr>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Invoice ID</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Amount Due</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Status</th>
                        <th className="text-left px-6 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerInvoices.map(invoice => (
                        <tr key={invoice.id} className="border-b border-[var(--border-color)]">
                          <td className="px-6 py-3 text-[var(--text-tertiary)] font-mono text-sm">{invoice.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{invoice.id}]</span></td>
                          <td className="px-6 py-3 text-[var(--text-primary)] font-medium text-sm">
                            {formatAmount(invoice.amount_due, invoice.currency)}
                          </td>
                          <td className="px-6 py-3"><StatusBadge status={invoice.status} /></td>
                          <td className="px-6 py-3 text-[var(--text-secondary)] text-sm">
                            {new Date(invoice.created * 1000).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-6 py-8 text-center text-sm text-[var(--text-tertiary)]">No invoices</div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Customer List View */
        <>
          {showCreateForm && (
            <div className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create New Customer</h3>
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                    placeholder="john@example.com"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
                >
                  Create Customer
                </button>
              </form>
            </div>
          )}

          <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Name</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Email</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Customer ID</th>
                  <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    onClick={() => handleSelectCustomer(customer)}
                  >
                    <td className="px-6 py-4 text-[var(--text-primary)] font-medium hover:underline">{customer.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{customer.id}]</span></td>
                    <td className="px-6 py-4 text-[var(--text-secondary)]">{customer.email || '-'}</td>
                    <td className="px-6 py-4 text-[var(--text-tertiary)] font-mono text-sm">{customer.id}</td>
                    <td className="px-6 py-4 text-[var(--text-secondary)] text-sm">
                      {new Date(customer.created * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers.length === 0 && (
              <div className="p-12 text-center text-[var(--text-secondary)]">
                <div className="text-5xl mb-3">👥</div>
                <p>No customers yet</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Products Tab Component
function ProductsTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [products, setProducts] = useState<Product[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateProduct, setShowCreateProduct] = useState(false)
  const [showCreatePrice, setShowCreatePrice] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', description: '' })
  const [newPrice, setNewPrice] = useState({ product: '', currency: 'usd', unit_amount: 0 })
  // Delete product state
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null)
  const [processingDelete, setProcessingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [productsData, pricesData] = await Promise.all([
        api.callTool<{ data: Product[] }>('list_products', { limit: 100 }),
        api.callTool<{ data: Price[] }>('list_prices', { limit: 100 }),
      ])
      setProducts(productsData?.data || [])
      setPrices(pricesData?.data || [])
    } catch (err) {
      // Error loading products
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.callTool('create_product', {
        name: newProduct.name,
        description: newProduct.description || null,
      })
      setNewProduct({ name: '', description: '' })
      setShowCreateProduct(false)
      await loadData()
    } catch (err) {
      // Error creating product
    }
  }

  const handleCreatePrice = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.callTool('create_price', {
        product: newPrice.product,
        currency: newPrice.currency,
        unit_amount: parseInt(newPrice.unit_amount),
      })
      setNewPrice({ product: '', currency: 'usd', unit_amount: '' })
      setShowCreatePrice(false)
      await loadData()
    } catch (err) {
      // Error creating price
    }
  }

  const handleStartDelete = (product: Product) => {
    setDeletingProduct(product)
    setDeleteError(null)
  }

  const handleDeleteProduct = async () => {
    if (!deletingProduct) return
    setProcessingDelete(true)
    setDeleteError(null)
    try {
      await api.callTool('delete_product', { product_id: deletingProduct.id })
      await loadData()
      setDeletingProduct(null)
    } catch (err: any) {
      const errorMessage = err?.message || err?.error || 'Failed to delete product. Please try again.'
      setDeleteError(errorMessage)
    } finally {
      setProcessingDelete(false)
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Products & Prices</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreatePrice(!showCreatePrice)}
            className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors font-medium border border-[var(--border-color)]"
          >
            {showCreatePrice ? 'Cancel' : '+ New Price'}
          </button>
          <button
            onClick={() => setShowCreateProduct(!showCreateProduct)}
            className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
          >
            {showCreateProduct ? 'Cancel' : '+ New Product'}
          </button>
        </div>
      </div>

      {showCreateProduct && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create New Product</h3>
          <form onSubmit={handleCreateProduct} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Product Name *</label>
              <input
                type="text"
                required
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                placeholder="Premium Subscription"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Description</label>
              <textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                placeholder="Description of your product"
                rows={3}
              />
            </div>
            <button type="submit" className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium">
              Create Product
            </button>
          </form>
        </div>
      )}

      {showCreatePrice && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create New Price</h3>
          <form onSubmit={handleCreatePrice} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Product *</label>
              <select
                required
                value={newPrice.product}
                onChange={(e) => setNewPrice({ ...newPrice, product: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
              >
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Currency *</label>
                <select
                  required
                  value={newPrice.currency}
                  onChange={(e) => setNewPrice({ ...newPrice, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                >
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                  <option value="gbp">GBP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Amount *</label>
                <input
                  type="number"
                  required
                  value={newPrice.unit_amount}
                  onChange={(e) => setNewPrice({ ...newPrice, unit_amount: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                  placeholder="1000"
                />
              </div>
            </div>
            <button type="submit" className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium">
              Create Price
            </button>
          </form>
        </div>
      )}

      <div className="space-y-6">
        {products.map((product) => {
          const productPrices = prices.filter(p => p.product === product.id)
          return (
            <div key={product.id} className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
              <div className="p-6 border-b border-[var(--border-color)]">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">{product.name}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{product.id}]</span></h3>
                    {product.description && (
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{product.description}</p>
                    )}
                    <p className="text-xs text-[var(--text-tertiary)] font-mono mt-2">{product.id}</p>
                  </div>
                  <button
                    data-testid={`delete-product-btn-${product.id}`}
                    onClick={() => handleStartDelete(product)}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {productPrices.length > 0 && (
                <div className="p-4">
                  <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Prices</h4>
                  <div className="space-y-2">
                    {productPrices.map((price) => (
                      <div key={price.id} className="flex justify-between items-center p-3 bg-[var(--bg-tertiary)] rounded-lg">
                        <div>
                          <div className="text-[var(--text-primary)] font-medium">
                            {formatAmount(price.unit_amount, price.currency)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{price.id}]</span>
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${price.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {price.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {products.length === 0 && (
          <div className="p-12 text-center text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl">
            <div className="text-5xl mb-3">📦</div>
            <p>No products yet</p>
          </div>
        )}
      </div>

      {/* Delete Product Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="delete-product-modal">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-6 w-full max-w-md border border-[var(--border-color)] shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Delete Product</h3>

            <div className="space-y-4">
              <p className="text-[var(--text-secondary)]">
                Are you sure you want to delete <strong className="text-[var(--text-primary)]">{deletingProduct.name}</strong><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{deletingProduct.id}]</span>?
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                This action cannot be undone. The product will be permanently deleted.
              </p>

              {deleteError && (
                <div data-testid="delete-product-error" className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2 text-red-500">
                    <span className="text-lg">✕</span>
                    <div>
                      <div className="font-medium">Delete failed</div>
                      <div className="text-sm mt-1 text-red-400">{deleteError}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  data-testid="delete-product-confirm-btn"
                  onClick={handleDeleteProduct}
                  disabled={processingDelete}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {processingDelete ? 'Deleting...' : 'Delete'}
                </button>
                <button
                  data-testid="delete-product-cancel-btn"
                  onClick={() => setDeletingProduct(null)}
                  disabled={processingDelete}
                  className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors font-medium border border-[var(--border-color)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Payments Tab Component
function PaymentsTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [payments, setPayments] = useState<PaymentIntent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreatePayment, setShowCreatePayment] = useState(false)
  const [showCreatePaymentLink, setShowCreatePaymentLink] = useState(false)
  const [newPayment, setNewPayment] = useState({ amount: '', currency: 'usd', customer: '' })
  const [creatingPayment, setCreatingPayment] = useState(false)
  const [createPaymentError, setCreatePaymentError] = useState<string | null>(null)
  const [newPaymentLink, setNewPaymentLink] = useState({ price: '', quantity: '1' })
  const [createdPaymentLink, setCreatedPaymentLink] = useState<{ id: string; priceId: string; quantity: number } | null>(null)
  const [creatingPaymentLink, setCreatingPaymentLink] = useState(false)
  const [prices, setPrices] = useState<Price[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  // Refund modal state
  const [refundingPayment, setRefundingPayment] = useState<PaymentIntent | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [processingRefund, setProcessingRefund] = useState(false)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundSuccess, setRefundSuccess] = useState<{ id: string; amount: number } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [paymentsData, pricesData, productsData, customersData] = await Promise.all([
        api.callTool<{ data: PaymentIntent[] }>('list_payment_intents', { limit: 100 }),
        api.callTool<{ data: Price[] }>('list_prices', { limit: 100 }),
        api.callTool<{ data: Product[] }>('list_products', { limit: 100 }),
        api.callTool<{ data: Customer[] }>('list_customers', { limit: 100 }),
      ])
      setPayments(paymentsData?.data || [])
      setPrices(pricesData?.data || [])
      setProducts(productsData?.data || [])
      setCustomers(customersData?.data || [])
    } catch (err) {
      // Error loading payments
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingPayment(true)
    setCreatePaymentError(null)
    try {
      const params: { amount: number; currency: string; customer?: string } = {
        amount: parseInt(newPayment.amount),
        currency: newPayment.currency,
      }
      if (newPayment.customer) {
        params.customer = newPayment.customer
      }
      await api.callTool('create_payment_intent', params)
      setNewPayment({ amount: '', currency: 'usd', customer: '' })
      setShowCreatePayment(false)
      await loadData()
    } catch (err: any) {
      setCreatePaymentError(err?.message || 'Failed to create payment intent')
    } finally {
      setCreatingPayment(false)
    }
  }

  const handleCreatePaymentLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingPaymentLink(true)
    try {
      const result = await api.callTool<{ id: string }>('create_payment_link', {
        price: newPaymentLink.price,
        quantity: parseInt(newPaymentLink.quantity),
      })
      if (result?.id) {
        setCreatedPaymentLink({
          id: result.id,
          priceId: newPaymentLink.price,
          quantity: parseInt(newPaymentLink.quantity)
        })
      }
      setNewPaymentLink({ price: '', quantity: '1' })
    } catch (err) {
      // Error creating payment link
    } finally {
      setCreatingPaymentLink(false)
    }
  }

  const handleStartRefund = (payment: PaymentIntent) => {
    setRefundingPayment(payment)
    setRefundAmount(payment.amount.toString())
    setRefundReason('')
    setRefundError(null)
    setRefundSuccess(null)
  }

  const handleCreateRefund = async () => {
    if (!refundingPayment) return
    setProcessingRefund(true)
    setRefundError(null)
    setRefundSuccess(null)
    try {
      const params: { payment_intent: string; amount?: number; reason?: string } = {
        payment_intent: refundingPayment.id,
        amount: parseInt(refundAmount) || refundingPayment.amount,
      }
      if (refundReason) {
        params.reason = refundReason
      }
      const result = await api.callTool<{ id: string; amount: number }>('create_refund', params)
      await loadData()
      setRefundSuccess({ id: result?.id || 'unknown', amount: params.amount || refundingPayment.amount })
    } catch (err: any) {
      const errorMessage = err?.message || err?.error || 'Failed to process refund. Please try again.'
      setRefundError(errorMessage)
    } finally {
      setProcessingRefund(false)
    }
  }

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId)
    return product?.name || productId
  }

  const formatPriceLabel = (price: Price) => {
    const productName = getProductName(price.product)
    const formattedPrice = formatAmount(price.unit_amount, price.currency)
    if (price.type === 'recurring' && price.recurring) {
      return `${productName} - ${formattedPrice}/${price.recurring.interval}`
    }
    return `${productName} - ${formattedPrice} (one-time)`
  }

  const activePrices = prices.filter(p => p.active)

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Payments</h2>
        <div className="flex gap-2">
          <button
            data-testid="create-payment-link-btn"
            onClick={() => {
              setShowCreatePaymentLink(!showCreatePaymentLink)
              setShowCreatePayment(false)
              setCreatedPaymentLink(null)
            }}
            className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-white rounded-lg transition-colors font-medium"
          >
            {showCreatePaymentLink ? 'Cancel' : '+ Payment Link'}
          </button>
          <button
            onClick={() => {
              setShowCreatePayment(!showCreatePayment)
              setShowCreatePaymentLink(false)
              setCreatedPaymentLink(null)
            }}
            className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
          >
            {showCreatePayment ? 'Cancel' : '+ Payment Intent'}
          </button>
        </div>
      </div>

      {showCreatePaymentLink && (
        <div data-testid="payment-link-form" className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create Payment Link</h3>
          {createdPaymentLink ? (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-500 mb-3">
                <span className="text-xl">✓</span>
                <span className="font-semibold">Payment Link Created!</span><span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{createdPaymentLink.id}]</span>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-sm text-[var(--text-secondary)]">Payment Link URL:</span>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] rounded-lg text-[var(--text-primary)] font-mono text-sm break-all">
                      https://buy.strope.com/test_{createdPaymentLink.id.replace('pl_', '')}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`https://buy.strope.com/test_${createdPaymentLink.id.replace('pl_', '')}`)}
                      className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors text-sm"
                      title="Copy URL"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                  <span className="font-medium">Product:</span>{' '}
                  {(() => {
                    const price = prices.find(p => p.id === createdPaymentLink.priceId)
                    if (!price) return createdPaymentLink.priceId
                    return `${getProductName(price.product)} - ${formatAmount(price.unit_amount, price.currency)}`
                  })()}
                  {' '}<span className="text-[var(--text-tertiary)]">× {createdPaymentLink.quantity}</span>
                </div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  Share this link with your customers to collect payments.
                </div>
              </div>
              <button
                onClick={() => {
                  setCreatedPaymentLink(null)
                  setShowCreatePaymentLink(false)
                }}
                className="mt-4 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleCreatePaymentLink} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Price *</label>
                  <select
                    data-testid="payment-link-price-select"
                    required
                    value={newPaymentLink.price}
                    onChange={(e) => setNewPaymentLink({ ...newPaymentLink, price: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
                  >
                    <option value="">Select a price</option>
                    {activePrices.map((price) => (
                      <option key={price.id} value={price.id}>
                        {formatPriceLabel(price)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Quantity *</label>
                  <input
                    data-testid="payment-link-quantity-input"
                    type="number"
                    required
                    min="1"
                    value={newPaymentLink.quantity}
                    onChange={(e) => setNewPaymentLink({ ...newPaymentLink, quantity: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
                    placeholder="1"
                  />
                </div>
              </div>
              <button
                data-testid="payment-link-submit-btn"
                type="submit"
                disabled={creatingPaymentLink || !newPaymentLink.price}
                className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {creatingPaymentLink ? 'Creating...' : 'Create Payment Link'}
              </button>
            </form>
          )}
        </div>
      )}

      {showCreatePayment && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create Payment Intent</h3>
          <form onSubmit={handleCreatePayment} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Amount (cents) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newPayment.amount}
                  onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
                  placeholder="2000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Currency *</label>
                <select
                  required
                  value={newPayment.currency}
                  onChange={(e) => setNewPayment({ ...newPayment, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
                >
                  <option value="usd">USD</option>
                  <option value="eur">EUR</option>
                  <option value="gbp">GBP</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Customer</label>
              <select
                value={newPayment.customer}
                onChange={(e) => setNewPayment({ ...newPayment, customer: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
              >
                <option value="">None</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>
            {createPaymentError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {createPaymentError}
              </div>
            )}
            <button
              type="submit"
              disabled={creatingPayment}
              className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium disabled:opacity-50"
            >
              {creatingPayment ? 'Creating...' : 'Create Payment Intent'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">Amount</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">Customer</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">Payment ID</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
              <th className="text-left px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} data-testid={`payment-${payment.id}`} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors">
                <td className="px-4 py-4 text-[var(--text-primary)] font-medium whitespace-nowrap">
                  {formatAmount(payment.amount, payment.currency)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{payment.id}]</span>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={payment.status} />
                </td>
                <td className="px-4 py-4 text-[var(--text-secondary)]">{payment.customer ? getCustomerName(payment.customer, customers) : '-'}</td>
                <td className="px-4 py-4 text-[var(--text-tertiary)] font-mono text-sm">{payment.id}</td>
                <td className="px-4 py-4 text-[var(--text-secondary)] text-sm whitespace-nowrap">
                  {new Date(payment.created * 1000).toLocaleDateString()}
                </td>
                <td className="px-4 py-4">
                  {payment.status === 'succeeded' && (
                    <button
                      data-testid={`refund-btn-${payment.id}`}
                      onClick={() => handleStartRefund(payment)}
                      className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
                    >
                      Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && (
          <div className="p-12 text-center text-[var(--text-secondary)]">
            <div className="text-5xl mb-3">💳</div>
            <p>No payments yet</p>
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="refund-modal">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-6 w-full max-w-md border border-[var(--border-color)] shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Refund Payment</h3>

            {refundSuccess ? (
              <div className="space-y-4">
                <div data-testid="refund-success" className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-500 mb-2">
                    <span className="text-xl">✓</span>
                    <span className="font-semibold">Refund Successful!</span>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    <div>Amount refunded: {formatAmount(refundSuccess.amount, refundingPayment.currency)}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">Refund ID: {refundSuccess.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{refundSuccess.id}]</span></div>
                  </div>
                </div>
                <button
                  data-testid="refund-done-btn"
                  onClick={() => setRefundingPayment(null)}
                  className="w-full px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Amount to refund ({refundingPayment.currency.toUpperCase()})
                  </label>
                  <input
                    data-testid="refund-amount-input"
                    type="number"
                    min="1"
                    max={refundingPayment.amount}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                  />
                  <div className="text-xs text-[var(--text-tertiary)] mt-1">
                    {refundingPayment.currency.toUpperCase()} · {refundingPayment.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{refundingPayment.id}]</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Reason (optional)
                  </label>
                  <select
                    data-testid="refund-reason-select"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                  >
                    <option value="">No reason</option>
                    <option value="duplicate">Duplicate</option>
                    <option value="fraudulent">Fraudulent</option>
                    <option value="requested_by_customer">Requested by customer</option>
                  </select>
                </div>

                {refundError && (
                  <div data-testid="refund-error" className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-start gap-2 text-red-500">
                      <span className="text-lg">✕</span>
                      <div>
                        <div className="font-medium">Refund failed</div>
                        <div className="text-sm mt-1 text-red-400">{refundError}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    data-testid="refund-submit-btn"
                    onClick={handleCreateRefund}
                    disabled={processingRefund}
                    className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                  >
                    {processingRefund ? 'Processing...' : 'Confirm Refund'}
                  </button>
                  <button
                    data-testid="refund-cancel-btn"
                    onClick={() => setRefundingPayment(null)}
                    disabled={processingRefund}
                    className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors font-medium border border-[var(--border-color)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Invoices, Subscriptions, Coupons, Disputes tabs and helper components will follow...
// Helper Components
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="w-12 h-12 border-4 border-[#0891B2]/30 border-t-[#0891B2] rounded-full animate-spin" />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    failed: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-700',
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-amber-100 text-amber-700',
    unpaid: 'bg-red-100 text-red-700',
    incomplete: 'bg-yellow-100 text-yellow-700',
    incomplete_expired: 'bg-red-100 text-red-700',
    paid: 'bg-green-100 text-green-700',
    open: 'bg-blue-100 text-blue-700',
    draft: 'bg-gray-100 text-gray-700',
    void: 'bg-gray-100 text-gray-700',
    uncollectible: 'bg-red-100 text-red-700',
    requires_payment_method: 'bg-yellow-100 text-yellow-700',
    requires_confirmation: 'bg-yellow-100 text-yellow-700',
    requires_action: 'bg-yellow-100 text-yellow-700',
    requires_capture: 'bg-blue-100 text-blue-700',
    processing: 'bg-blue-100 text-blue-700',
  }

  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {label}
    </span>
  )
}

// Helper function to get customer name by ID
function getCustomerName(customerId: string, customers: Customer[]): string {
  const customer = customers.find(c => c.id === customerId)
  return customer?.name || customerId
}

// Helper function to get coupon display name
function getCouponDisplay(couponId: string, coupons: Coupon[]): string {
  const coupon = coupons.find(c => c.id === couponId)
  if (!coupon) return couponId
  
  const discount = coupon.percent_off 
    ? `${coupon.percent_off}% OFF` 
    : coupon.amount_off 
    ? `${coupon.amount_off} ${coupon.currency?.toUpperCase()} OFF`
    : 'Discount'
  
  const name = coupon.name || coupon.id
  return `${name} (${discount})`
}

// Invoices Tab
function InvoicesTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newInvoice, setNewInvoice] = useState({ customer: '', days_until_due: '', price: '' })
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [finalizingId, setFinalizingId] = useState<string | null>(null)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null)
  const [newItem, setNewItem] = useState({ price: '' })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [invoicesData, customersData, pricesData, productsData] = await Promise.all([
        api.callTool<{ data: Invoice[] }>('list_invoices', { limit: 100 }),
        api.callTool<{ data: Customer[] }>('list_customers', { limit: 100 }),
        api.callTool<{ data: Price[] }>('list_prices', { limit: 100 }),
        api.callTool<{ data: Product[] }>('list_products', { limit: 100 }),
      ])
      setInvoices(invoicesData?.data || [])
      setCustomers(customersData?.data || [])
      setPrices(pricesData?.data || [])
      setProducts(productsData?.data || [])
    } catch (err) {
      // Error loading invoices
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const params: any = { customer: newInvoice.customer }
      if (newInvoice.days_until_due) {
        params.days_until_due = parseInt(newInvoice.days_until_due)
      }
      const invoice = await api.callTool<Invoice>('create_invoice', params)
      // If a price was selected, create an invoice item for it
      if (newInvoice.price && invoice?.id) {
        await api.callTool('create_invoice_item', {
          customer: newInvoice.customer,
          price: newInvoice.price,
          invoice: invoice.id,
        })
      }
      setNewInvoice({ customer: '', days_until_due: '', price: '' })
      setShowCreate(false)
      await loadData()
    } catch (err) {
      // Error creating invoice
    }
  }

  const handleFinalizeInvoice = async (invoiceId: string) => {
    setFinalizingId(invoiceId)
    setFinalizeError(null)
    try {
      const result = await api.callTool<Invoice>('finalize_invoice', { invoice: invoiceId })
      if (result) {
        setInvoices(prev => prev.map(inv =>
          inv.id === invoiceId ? { ...inv, ...result } : inv
        ))
      } else {
        await loadData()
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to finalize invoice'
      setFinalizeError(msg.includes('line items') ? 'Invoice must have at least one line item before finalizing. Click "Details" to add items.' : msg)
    } finally {
      setFinalizingId(null)
    }
  }

  const handleAddInvoiceItem = async (e: React.FormEvent, invoice: Invoice) => {
    e.preventDefault()
    const selectedPriceId = newItem.price
    setAddingItemTo(invoice.id)
    try {
      const result = await api.callTool<{ id: string; amount: number; currency: string; quantity: number; price: { id: string; product: string; unit_amount: number; currency: string } }>('create_invoice_item', {
        customer: invoice.customer,
        price: selectedPriceId,
        invoice: invoice.id,
      })
      setNewItem({ price: '' })
      // Optimistically update local state to append the new item (avoids backend
      // rebuilding lines from invoice_items only, which drops pre-existing items)
      if (result) {
        const selectedPrice = prices.find(p => p.id === selectedPriceId)
        const productName = selectedPrice ? getProductName(selectedPrice.product) : 'Item'
        const newLineItem: InvoiceLineItem = {
          id: result.id,
          amount: result.amount,
          currency: result.currency || invoice.currency,
          description: productName,
          quantity: result.quantity || 1,
        }
        setInvoices(prev => prev.map(inv => {
          if (inv.id !== invoice.id) return inv
          const existingLines = inv.lines?.data || []
          return {
            ...inv,
            amount_due: (inv.amount_due || 0) + result.amount,
            amount_remaining: (inv.amount_remaining || 0) + result.amount,
            lines: {
              data: [...existingLines, newLineItem],
            },
          }
        }))
      }
    } catch (err) {
      // Error adding invoice item
    } finally {
      setAddingItemTo(null)
    }
  }

  const getProductName = (productId: string): string => {
    const product = products.find(p => p.id === productId)
    return product?.name || productId
  }

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  }

  const activePrices = prices.filter(p => p.active && p.unit_amount)

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Invoices</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
        >
          {showCreate ? 'Cancel' : '+ New Invoice'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create Invoice</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Customer *</label>
              <select
                required
                value={newInvoice.customer}
                onChange={(e) => setNewInvoice({ ...newInvoice, customer: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Line Item (Price) *</label>
              <select
                required
                value={newInvoice.price}
                onChange={(e) => setNewInvoice({ ...newInvoice, price: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
              >
                <option value="">Select a line item</option>
                {activePrices.map((price) => (
                  <option key={price.id} value={price.id}>
                    {getProductName(price.product)} - {formatAmount(price.unit_amount, price.currency)}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const selectedPrice = activePrices.find(p => p.id === newInvoice.price)
              return (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Amount (cents)</label>
                  <input
                    type="number"
                    min="0"
                    readOnly
                    value={selectedPrice?.unit_amount ?? ''}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] opacity-70 cursor-not-allowed"
                    placeholder="Select a line item above"
                  />
                  {selectedPrice && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-1">
                      Invoice total: {formatAmount(selectedPrice.unit_amount, selectedPrice.currency)}
                    </div>
                  )}
                </div>
              )
            })()}
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Days Until Due</label>
              <input
                type="number"
                min="0"
                value={newInvoice.days_until_due}
                onChange={(e) => setNewInvoice({ ...newInvoice, days_until_due: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2] text-[var(--text-primary)]"
                placeholder="30"
              />
            </div>
            <button type="submit" className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium">
              Create Invoice
            </button>
          </form>
        </div>
      )}

      {finalizeError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {finalizeError}
        </div>
      )}
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-x-auto">
        <div className="overflow-y-auto max-h-[600px]">
        <table className="w-full min-w-[900px]">
          <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] sticky top-0 z-10">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Invoice ID</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Customer</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Amount Due</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Days Until Due</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <React.Fragment key={invoice.id}>
                <tr className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors">
                  <td className="px-6 py-4 text-[var(--text-tertiary)] font-mono text-sm">{invoice.id}</td>
                  <td className="px-6 py-4 text-[var(--text-primary)]">{getCustomerName(invoice.customer, customers)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{invoice.id}]</span></td>
                  <td className="px-6 py-4 text-[var(--text-primary)] font-medium">
                    {formatAmount(invoice.amount_due, invoice.currency)}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-6 py-4 text-[var(--text-secondary)] text-sm">
                    {(() => {
                      const dueDate = invoice.due_date ? new Date(invoice.due_date * 1000) : null
                      const today = new Date()
                      if (!dueDate) return '-'
                      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      return daysUntil > 0 ? `${daysUntil} days` : 'Overdue'
                    })()}
                  </td>
                  <td className="px-6 py-4 text-[var(--text-secondary)] text-sm">
                    {new Date(invoice.created * 1000).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setExpandedInvoiceId(expandedInvoiceId === invoice.id ? null : invoice.id)}
                        className="px-3 py-1 text-xs bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] rounded transition-colors"
                      >
                        {expandedInvoiceId === invoice.id ? 'Hide' : 'Details'}
                      </button>
                      {invoice.status === 'draft' && (
                        <button
                          onClick={() => handleFinalizeInvoice(invoice.id)}
                          disabled={finalizingId === invoice.id}
                          className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {finalizingId === invoice.id ? 'Finalizing...' : 'Finalize'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedInvoiceId === invoice.id && (
                  <tr className="bg-[var(--bg-tertiary)]">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Line Items</h4>
                          {invoice.lines?.data && invoice.lines.data.length > 0 ? (
                            <div className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-[var(--bg-secondary)]">
                                  <tr>
                                    <th className="text-left px-4 py-2 text-[var(--text-secondary)]">Description</th>
                                    <th className="text-left px-4 py-2 text-[var(--text-secondary)]">Quantity</th>
                                    <th className="text-left px-4 py-2 text-[var(--text-secondary)]">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {invoice.lines.data.map((item) => (
                                    <tr key={item.id} className="border-t border-[var(--border-color)]">
                                      <td className="px-4 py-2 text-[var(--text-primary)]">{item.description || 'No description'}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{item.id}]</span></td>
                                      <td className="px-4 py-2 text-[var(--text-secondary)]">{item.quantity}</td>
                                      <td className="px-4 py-2 text-[var(--text-primary)] font-medium">{formatAmount(item.amount, item.currency || invoice.currency)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-[var(--text-tertiary)]">No line items</p>
                          )}
                        </div>

                        {invoice.status === 'draft' && (
                          <div className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] p-4">
                            <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Add Line Item</h4>
                            <form onSubmit={(e) => handleAddInvoiceItem(e, invoice)} className="flex gap-3 items-end">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Price</label>
                                <select
                                  required
                                  value={newItem.price}
                                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                                >
                                  <option value="">Select price</option>
                                  {activePrices.map((price) => (
                                    <option key={price.id} value={price.id}>
                                      {getProductName(price.product)} - {formatAmount(price.unit_amount, price.currency)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="submit"
                                disabled={addingItemTo === invoice.id}
                                className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                              >
                                {addingItemTo === invoice.id ? 'Adding...' : 'Add Item'}
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <div className="p-12 text-center text-[var(--text-secondary)]">
            <div className="text-5xl mb-3">📄</div>
            <p>No invoices yet</p>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

// Subscriptions Tab
function SubscriptionsTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ priceId: string; quantity: number }>({ priceId: '', quantity: 1 })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [subsData, customersData, pricesData, productsData] = await Promise.all([
        api.callTool<{ data: Subscription[] }>('list_subscriptions', { limit: 100 }),
        api.callTool<{ data: Customer[] }>('list_customers', { limit: 100 }),
        api.callTool<{ data: Price[] }>('list_prices', { limit: 100 }),
        api.callTool<{ data: Product[] }>('list_products', { limit: 100 }),
      ])
      setSubscriptions(subsData?.data || [])
      setCustomers(customersData?.data || [])
      setPrices(pricesData?.data || [])
      setProducts(productsData?.data || [])
    } catch (err) {
      // Error loading subscriptions
    } finally {
      setLoading(false)
    }
  }

  const handleCancelSubscription = async (subscriptionId: string) => {
    setCancellingId(subscriptionId)
    try {
      await api.callTool('cancel_subscription', { subscription: subscriptionId })
      await loadData()
    } catch (err) {
      // Error cancelling subscription
    } finally {
      setCancellingId(null)
      setConfirmCancelId(null)
    }
  }

  const handleStartEdit = (sub: Subscription) => {
    const currentPriceId = sub.items.data[0]?.price?.id || ''
    setEditingId(sub.id)
    setEditForm({ priceId: currentPriceId, quantity: 1 })
  }

  const handleUpdateSubscription = async (sub: Subscription) => {
    if (!editForm.priceId || !sub.items.data[0]?.id) return
    setUpdatingId(sub.id)
    try {
      await api.callTool('update_subscription', {
        subscription: sub.id,
        items: [{
          id: sub.items.data[0].id,
          price: editForm.priceId,
          quantity: editForm.quantity
        }]
      })
      await loadData()
      setEditingId(null)
    } catch (err) {
      // Error updating subscription
    } finally {
      setUpdatingId(null)
    }
  }

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId)
    return product?.name || productId
  }

  const activePrices = prices.filter(p => p.active)

  const formatPriceLabel = (price: Price) => {
    const productName = getProductName(price.product)
    const formattedPrice = formatAmount(price.unit_amount, price.currency)
    if (price.type === 'recurring' && price.recurring) {
      return `${productName} - ${formattedPrice}/${price.recurring.interval}`
    }
    return `${productName} - ${formattedPrice} (one-time)`
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Subscriptions</h2>

      <div className="space-y-4">
        {subscriptions.map((sub) => (
          <div key={sub.id} data-testid={`subscription-${sub.id}`} className="bg-[var(--bg-secondary)] rounded-xl p-6 border border-[var(--border-color)]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">{getCustomerName(sub.customer, customers)}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{sub.id}]</span></div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={sub.status} />
                {['active', 'trialing', 'past_due'].includes(sub.status) && editingId !== sub.id && confirmCancelId !== sub.id && (
                  <>
                    <button
                      data-testid={`update-btn-${sub.id}`}
                      onClick={() => handleStartEdit(sub)}
                      className="px-3 py-1 bg-[#0891B2] hover:bg-[#0E7490] text-white text-sm rounded-lg transition-colors"
                    >
                      Update
                    </button>
                    <button
                      data-testid={`cancel-btn-${sub.id}`}
                      onClick={() => setConfirmCancelId(sub.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {confirmCancelId === sub.id && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">Cancel?</span>
                    <button
                      data-testid="confirm-cancel-yes"
                      onClick={() => handleCancelSubscription(sub.id)}
                      disabled={cancellingId === sub.id}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      {cancellingId === sub.id ? 'Cancelling...' : 'Yes'}
                    </button>
                    <button
                      data-testid="confirm-cancel-no"
                      onClick={() => setConfirmCancelId(null)}
                      disabled={cancellingId === sub.id}
                      className="px-3 py-1 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] text-sm rounded-lg transition-colors"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>

            {editingId === sub.id && (
              <div data-testid="update-form" className="mb-4 p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)]">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Update Subscription</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Price</label>
                    <select
                      data-testid="update-price-select"
                      value={editForm.priceId}
                      onChange={(e) => setEditForm({ ...editForm, priceId: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                    >
                      <option value="">Select a price</option>
                      {activePrices.map((price) => (
                        <option key={price.id} value={price.id}>
                          {formatPriceLabel(price)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Quantity</label>
                    <input
                      data-testid="update-quantity-input"
                      type="number"
                      min="1"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    data-testid="update-save-btn"
                    onClick={() => handleUpdateSubscription(sub)}
                    disabled={updatingId === sub.id || !editForm.priceId}
                    className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updatingId === sub.id ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    data-testid="update-dismiss-btn"
                    onClick={() => setEditingId(null)}
                    disabled={updatingId === sub.id}
                    className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] text-sm rounded-lg transition-colors border border-[var(--border-color)]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[var(--text-secondary)]">Period Start</div>
                <div className="text-[var(--text-primary)] font-medium">
                  {new Date(sub.current_period_start * 1000).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Period End</div>
                <div className="text-[var(--text-primary)] font-medium">
                  {new Date(sub.current_period_end * 1000).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Amount</div>
                <div className="text-[var(--text-primary)] font-medium">
                  {(() => {
                    if (sub.items.data.length === 0) return '-'
                    const priceId = sub.items.data[0].price?.id
                    if (!priceId) return '-'
                    const fullPrice = prices.find(p => p.id === priceId)
                    if (!fullPrice) return '-'
                    return formatAmount(fullPrice.unit_amount, fullPrice.currency)
                  })()}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Quantity</div>
                <div className="text-[var(--text-primary)] font-medium">
                  {sub.items.data.length > 0 ? sub.items.data[0].quantity : '-'}
                </div>
              </div>
            </div>
          </div>
        ))}
        {subscriptions.length === 0 && (
          <div className="p-12 text-center text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl">
            <div className="text-5xl mb-3">🔄</div>
            <p>No subscriptions yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Coupons Tab
function CouponsTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newCoupon, setNewCoupon] = useState({
    id: '',
    percent_off: '',
    amount_off: '',
    currency: 'usd',
    duration: 'once',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await api.callTool<{ data: Coupon[] }>('list_coupons', { limit: 100 })
      setCoupons(result?.data || [])
    } catch (err) {
      // Error loading coupons
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const params: any = {
        duration: newCoupon.duration,
      }
      if (newCoupon.id) {
        params.name = newCoupon.id
      }
      if (newCoupon.percent_off) {
        params.percent_off = parseFloat(newCoupon.percent_off)
      } else if (newCoupon.amount_off) {
        params.amount_off = parseInt(newCoupon.amount_off)
        params.currency = newCoupon.currency
      }
      await api.callTool('create_coupon', params)
      setNewCoupon({ id: '', percent_off: '', amount_off: '', currency: 'usd', duration: 'once' })
      setShowCreate(false)
      await loadData()
    } catch (err) {
      // Error creating coupon
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Coupons</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium"
        >
          {showCreate ? 'Cancel' : '+ New Coupon'}
        </button>
      </div>

      {showCreate && (
        <div className="bg-[var(--bg-secondary)] rounded-xl p-6 mb-6 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Create Coupon</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Coupon ID *</label>
              <input
                type="text"
                required
                value={newCoupon.id}
                onChange={(e) => setNewCoupon({ ...newCoupon, id: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                placeholder="SUMMER2024"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Percent Off</label>
                <input
                  type="number"
                  value={newCoupon.percent_off}
                  onChange={(e) => setNewCoupon({ ...newCoupon, percent_off: e.target.value, amount_off: '' })}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                  placeholder="25"
                  min="0"
                  max="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Amount Off</label>
                <input
                  type="number"
                  value={newCoupon.amount_off}
                  onChange={(e) => setNewCoupon({ ...newCoupon, amount_off: e.target.value, percent_off: '' })}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
                  placeholder="1000"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Duration *</label>
              <select
                required
                value={newCoupon.duration}
                onChange={(e) => setNewCoupon({ ...newCoupon, duration: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0891B2]"
              >
                <option value="once">Once</option>
                <option value="repeating">Repeating</option>
                <option value="forever">Forever</option>
              </select>
            </div>
            <button type="submit" className="px-6 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium">
              Create Coupon
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {coupons.map((coupon) => (
          <div key={coupon.id} className="bg-[var(--bg-secondary)] rounded-xl p-6 border border-[var(--border-color)]">
            <div className="text-2xl font-bold text-[var(--text-primary)] mb-2">
              {coupon.name || coupon.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{coupon.id}]</span>
            </div>
            <div className="text-xl font-bold text-[var(--text-primary)] mb-2">
              {coupon.percent_off ? `${coupon.percent_off}% OFF` : `${formatAmount(coupon.amount_off || 0, coupon.currency || 'usd')} OFF`}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Duration: {coupon.duration}</div>
            {coupon.created && (
              <div className="text-xs text-[var(--text-tertiary)] mt-2">
                Created {typeof coupon.created === 'number' ? new Date(coupon.created * 1000).toLocaleDateString() : new Date(coupon.created).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
        {coupons.length === 0 && (
          <div className="col-span-full p-12 text-center text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded-xl">
            <div className="text-5xl mb-3">🎟️</div>
            <p>No coupons yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Disputes Tab
function DisputesTab({ api }: { api: ReturnType<typeof useBackendAPI> }) {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  // Update dispute state
  const [updatingDispute, setUpdatingDispute] = useState<Dispute | null>(null)
  const [evidenceForm, setEvidenceForm] = useState({
    cancellation_policy_disclosure: '',
    cancellation_rebuttal: '',
    duplicate_charge_explanation: '',
    uncategorized_text: '',
  })
  const [submitToBank, setSubmitToBank] = useState(false)
  const [processingUpdate, setProcessingUpdate] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await api.callTool<{ data: Dispute[] }>('list_disputes', { limit: 100 })
      setDisputes(result?.data || [])
    } catch (err) {
      // Error loading disputes
    } finally {
      setLoading(false)
    }
  }

  const handleStartUpdate = (dispute: Dispute) => {
    setUpdatingDispute(dispute)
    setEvidenceForm({
      cancellation_policy_disclosure: '',
      cancellation_rebuttal: '',
      duplicate_charge_explanation: '',
      uncategorized_text: '',
    })
    setSubmitToBank(false)
    setUpdateError(null)
  }

  const handleUpdateDispute = async () => {
    if (!updatingDispute) return

    // Check that at least one evidence field has content
    const hasEvidence =
      evidenceForm.cancellation_policy_disclosure.trim() ||
      evidenceForm.cancellation_rebuttal.trim() ||
      evidenceForm.duplicate_charge_explanation.trim() ||
      evidenceForm.uncategorized_text.trim()

    if (!hasEvidence) {
      setUpdateError('Please fill in at least one evidence field before submitting.')
      return
    }

    setProcessingUpdate(true)
    setUpdateError(null)
    try {
      // Build evidence object with only non-empty fields
      const evidence: Record<string, string> = {}
      if (evidenceForm.cancellation_policy_disclosure) {
        evidence.cancellation_policy_disclosure = evidenceForm.cancellation_policy_disclosure
      }
      if (evidenceForm.cancellation_rebuttal) {
        evidence.cancellation_rebuttal = evidenceForm.cancellation_rebuttal
      }
      if (evidenceForm.duplicate_charge_explanation) {
        evidence.duplicate_charge_explanation = evidenceForm.duplicate_charge_explanation
      }
      if (evidenceForm.uncategorized_text) {
        evidence.uncategorized_text = evidenceForm.uncategorized_text
      }

      const params: { dispute: string; evidence?: Record<string, string>; submit?: boolean } = {
        dispute: updatingDispute.id,
      }
      if (Object.keys(evidence).length > 0) {
        params.evidence = evidence
      }
      if (submitToBank) {
        params.submit = true
      }

      await api.callTool('update_dispute', params)
      // Optimistically update the dispute status in local state
      if (submitToBank) {
        setDisputes(prev => prev.map(d =>
          d.id === updatingDispute.id ? { ...d, status: 'under_review' } : d
        ))
      } else {
        await loadData()
      }
      setUpdatingDispute(null)
    } catch (err: any) {
      const errorMessage = err?.message || err?.error || 'Failed to update dispute. Please try again.'
      setUpdateError(errorMessage)
    } finally {
      setProcessingUpdate(false)
    }
  }

  // Helper to check if dispute can be updated
  // Updatable statuses: warning_needs_response, needs_response, under_review
  const isDisputeUpdatable = (status: string) => {
    const updatableStatuses = ['warning_needs_response', 'needs_response', 'under_review']
    return updatableStatuses.includes(status)
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6">Disputes</h2>

      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Dispute ID</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Payment Intent</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Amount</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Reason</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Status</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Created</th>
              <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((dispute) => (
              <tr key={dispute.id} data-testid={`dispute-${dispute.id}`} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors">
                <td className="px-6 py-4 text-[var(--text-tertiary)] font-mono text-sm">{dispute.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{dispute.id}]</span></td>
                <td className="px-6 py-4 text-[var(--text-tertiary)] font-mono text-sm">{dispute.payment_intent}</td>
                <td className="px-6 py-4 text-[var(--text-primary)] font-medium">
                  {formatAmount(dispute.amount, dispute.currency)}
                </td>
                <td className="px-6 py-4 text-[var(--text-secondary)]">{dispute.reason}</td>
                <td className="px-6 py-4">
                  <StatusBadge status={dispute.status} />
                </td>
                <td className="px-6 py-4 text-[var(--text-secondary)] text-sm">
                  {new Date(dispute.created * 1000).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  {isDisputeUpdatable(dispute.status) && (
                    <button
                      data-testid={`submit-evidence-btn-${dispute.id}`}
                      onClick={() => handleStartUpdate(dispute)}
                      className="px-4 py-1.5 bg-[#0891B2] hover:bg-[#0E7490] text-white text-sm rounded-lg transition-colors whitespace-nowrap"
                    >
                      Submit Evidence
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {disputes.length === 0 && (
          <div className="p-12 text-center text-[var(--text-secondary)]">
            <div className="text-5xl mb-3">⚠️</div>
            <p>No disputes</p>
          </div>
        )}
      </div>

      {/* Submit Evidence Modal */}
      {updatingDispute && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="submit-evidence-modal">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-5 w-full max-w-2xl border border-[var(--border-color)] shadow-xl max-h-[500px] flex flex-col">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Submit Evidence</h3>
            <p className="text-sm text-[var(--text-tertiary)] mb-3">
              Dispute: {updatingDispute.id}<span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-tertiary, #888)' }}>[{updatingDispute.id}]</span> · {formatAmount(updatingDispute.amount, updatingDispute.currency)} · {updatingDispute.reason}
            </p>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Cancellation Policy
                  </label>
                  <textarea
                    data-testid="evidence-cancellation-policy"
                    value={evidenceForm.cancellation_policy_disclosure}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, cancellation_policy_disclosure: e.target.value })}
                    placeholder="Refund policy disclosure..."
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2] resize-none"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Cancellation Rebuttal
                  </label>
                  <textarea
                    data-testid="evidence-cancellation-rebuttal"
                    value={evidenceForm.cancellation_rebuttal}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, cancellation_rebuttal: e.target.value })}
                    placeholder="Rebuttal to cancellation..."
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2] resize-none"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Duplicate Charge
                  </label>
                  <textarea
                    data-testid="evidence-duplicate-explanation"
                    value={evidenceForm.duplicate_charge_explanation}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, duplicate_charge_explanation: e.target.value })}
                    placeholder="Why not a duplicate..."
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2] resize-none"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Additional Evidence
                  </label>
                  <textarea
                    data-testid="evidence-uncategorized-text"
                    value={evidenceForm.uncategorized_text}
                    onChange={(e) => setEvidenceForm({ ...evidenceForm, uncategorized_text: e.target.value })}
                    placeholder="Other evidence..."
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0891B2] resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="submit-to-bank"
                  data-testid="submit-to-bank-checkbox"
                  checked={submitToBank}
                  onChange={(e) => setSubmitToBank(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border-color)] text-[#0891B2] focus:ring-[#0891B2]"
                />
                <label htmlFor="submit-to-bank" className="text-sm text-[var(--text-secondary)]">
                  Submit immediately to bank
                </label>
              </div>

              {updateError && (
                <div data-testid="submit-evidence-error" className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <div className="flex items-start gap-2 text-red-500">
                    <span className="text-lg">✕</span>
                    <div>
                      <div className="font-medium">Update failed</div>
                      <div className="text-sm mt-1 text-red-400">{updateError}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-3 mt-3 border-t border-[var(--border-color)]">
              <button
                data-testid="submit-evidence-confirm-btn"
                onClick={handleUpdateDispute}
                disabled={processingUpdate}
                className="flex-1 px-4 py-2 bg-[#0891B2] hover:bg-[#0E7490] text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                {processingUpdate ? 'Submitting...' : 'Submit Evidence'}
              </button>
              <button
                data-testid="submit-evidence-cancel-btn"
                onClick={() => setUpdatingDispute(null)}
                disabled={processingUpdate}
                className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--border-color)] text-[var(--text-primary)] rounded-lg transition-colors font-medium border border-[var(--border-color)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
