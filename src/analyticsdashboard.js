import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, FileText, Calendar,
  Download, RefreshCw, AlertCircle
} from 'lucide-react';

// Initialize Supabase (Replace with your credentials)
const supabaseUrl = 'https://miwoeqlnwisnekfodpwo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pd29lcWxud2lzbmVrZm9kcHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0OTY3NzAsImV4cCI6MjA3ODA3Mjc3MH0.QapR4fpfUT0bXMFcqyaRFQHKIiogB3xV5jGZD8mijwM';
const supabase = createClient(supabaseUrl, supabaseKey);

// Service Layer for Data Operations
class AnalyticsService {
  static async fetchReceipts(startDate = null, endDate = null) {
    try {
      let query = supabase
        .from('moneyreciept')
        .select('*')
        .order('rcdt', { ascending: false });

      if (startDate) {
        query = query.gte('rcdt', startDate);
      }
      if (endDate) {
        query = query.lte('rcdt', endDate);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error fetching receipts:', error);
      return { data: null, error };
    }
  }

  static calculateKPIs(data) {
    if (!data || data.length === 0) {
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        avgTransactionValue: 0,
        totalDiscount: 0,
        outstandingDue: 0
      };
    }

    const totalRevenue = data.reduce((sum, r) => sum + parseFloat(r.netamt || 0), 0);
    const totalDiscount = data.reduce((sum, r) => sum + parseFloat(r.discamt || 0), 0);
    const outstandingDue = data.reduce((sum, r) => sum + parseFloat(r.due || 0), 0);
    
    return {
      totalRevenue,
      totalTransactions: data.length,
      avgTransactionValue: totalRevenue / data.length,
      totalDiscount,
      outstandingDue
    };
  }

  static prepareChartData(data) {
    if (!data || data.length === 0) return [];

    // Group by date
    const dateGroups = data.reduce((acc, item) => {
      const date = item.rcdt;
      if (!acc[date]) {
        acc[date] = {
          date,
          revenue: 0,
          transactions: 0,
          discount: 0
        };
      }
      acc[date].revenue += parseFloat(item.netamt || 0);
      acc[date].transactions += 1;
      acc[date].discount += parseFloat(item.discamt || 0);
      return acc;
    }, {});

    return Object.values(dateGroups).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
  }

  static preparePaymentMethodData(data) {
    if (!data || data.length === 0) return [];

    const methods = data.reduce((acc, item) => {
      const method = item.remarks || 'Unknown';
      if (!acc[method]) {
        acc[method] = { name: method, value: 0, count: 0 };
      }
      acc[method].value += parseFloat(item.netamt || 0);
      acc[method].count += 1;
      return acc;
    }, {});

    return Object.values(methods);
  }

  static prepareUserDistribution(data) {
    if (!data || data.length === 0) return [];

    const users = data.reduce((acc, item) => {
      const user = item.userid || 'Unknown';
      if (!acc[user]) {
        acc[user] = { name: user, value: 0, transactions: 0 };
      }
      acc[user].value += parseFloat(item.netamt || 0);
      acc[user].transactions += 1;
      return acc;
    }, {});

    return Object.values(users).sort((a, b) => b.value - a.value).slice(0, 10);
  }
}

// KPI Card Component
const KPICard = ({ title, value, icon: Icon, trend, trendValue, prefix = '', suffix = '' }) => {
  const isPositive = trend === 'up';
  
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-50 rounded-lg">
            <Icon className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        </div>
        {trendValue && (
          <div className={`flex items-center space-x-1 text-sm font-medium ${
            isPositive ? 'text-green-600' : 'text-red-600'
          }`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            <span>{trendValue}%</span>
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="text-3xl font-bold text-gray-900">
          {prefix}{typeof value === 'number' ? value.toLocaleString('en-IN', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0
          }) : value}{suffix}
        </p>
      </div>
    </div>
  );
};

// Chart Container Component
const ChartContainer = ({ title, children, actions }) => (
  <div className="chart-container">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {actions && <div className="flex space-x-2">{actions}</div>}
    </div>
    {children}
  </div>
);

// Main Dashboard Component
const AnalyticsDashboard = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [refreshing, setRefreshing] = useState(false);
  const [chartType, setChartType] = useState('area');

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  // Fetch data on mount and when date range changes
  useEffect(() => {
    fetchData();
  }, [dateRange, fetchData]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const { data: receipts, error: fetchError } = await AnalyticsService.fetchReceipts(
      dateRange.start || null,
      dateRange.end || null
    );

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setData(receipts || []);
    }
    
    setLoading(false);
  }, [dateRange]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleExport = () => {
    const csv = [
      ['Date', 'Bill No', 'Patient', 'Amount', 'Discount', 'Net Amount', 'Payment Method'],
      ...data.map(r => [
        r.rcdt,
        r.mrbillno,
        r.paidby,
        r.totalamt,
        r.discamt,
        r.netamt,
        r.remarks
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString()}.csv`;
    a.click();
  };

  // Memoized calculations
  const kpis = useMemo(() => AnalyticsService.calculateKPIs(data), [data]);
  const chartData = useMemo(() => AnalyticsService.prepareChartData(data), [data]);
  const paymentMethodData = useMemo(() => AnalyticsService.preparePaymentMethodData(data), [data]);
  const userDistribution = useMemo(() => AnalyticsService.prepareUserDistribution(data), [data]);

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2 text-center">Error Loading Data</h3>
          <p className="text-gray-600 text-center mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="dashboard-header">
          <h1 className="dashboard-title">Analytics Dashboard</h1>
          <p className="dashboard-subtitle">Real-time insights and performance metrics</p>
        </div>

        {/* Filters and Actions */}
        <div className="filter-section">
          <div className="date-range-picker">
            <Calendar className="w-5 h-5 text-gray-500" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="date-input"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="date-input"
            />
            <button
              onClick={() => setDateRange({ start: '', end: '' })}
              className="action-button"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="action-button"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExport}
              className="action-button"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="kpi-grid mb-8">
          <KPICard
            title="Total Revenue"
            value={kpis.totalRevenue}
            icon={DollarSign}
            prefix="₹"
            trend="up"
            trendValue="12.5"
          />
          <KPICard
            title="Transactions"
            value={kpis.totalTransactions}
            icon={FileText}
            trend="up"
            trendValue="8.2"
          />
          <KPICard
            title="Avg Transaction"
            value={kpis.avgTransactionValue}
            icon={Users}
            prefix="₹"
          />
          <KPICard
            title="Total Discount"
            value={kpis.totalDiscount}
            icon={TrendingDown}
            prefix="₹"
            trend="down"
          />
        </div>

        {/* Charts Grid */}
        <div className="chart-grid mb-6">
          {/* Revenue Trend Chart */}
          <ChartContainer
            title="Revenue Trend"
            actions={
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="area">Area</option>
                <option value="line">Line</option>
                <option value="bar">Bar</option>
              </select>
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              {chartType === 'area' && (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              )}
              {chartType === 'line' && (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={2} />
                </LineChart>
              )}
              {chartType === 'bar' && (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                  <YAxis stroke="#6B7280" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  />
                  <Bar dataKey="revenue" fill="#3B82F6" radius={[8, 8, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartContainer>

          {/* Payment Methods Distribution */}
          <ChartContainer title="Payment Methods Distribution">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentMethodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* Full Width Charts */}
        <div className="space-y-6">
          {/* Top Users by Revenue */}
          <ChartContainer title="Top 10 Users by Revenue">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={userDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#6B7280" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#6B7280" fontSize={12} width={100} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                  formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                />
                <Bar dataKey="value" fill="#10B981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>

          {/* Transactions and Discounts Comparison */}
          <ChartContainer title="Daily Transactions & Discounts">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTransactions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDiscount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="transactions"
                  stroke="#8B5CF6"
                  fillOpacity={1}
                  fill="url(#colorTransactions)"
                  name="Transactions"
                />
                <Area
                  type="monotone"
                  dataKey="discount"
                  stroke="#F59E0B"
                  fillOpacity={1}
                  fill="url(#colorDiscount)"
                  name="Discount (₹)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>

        {/* Recent Transactions Table */}
        <div className="chart-container">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
          <div className="overflow-x-auto">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Bill No</th>
                  <th>Patient</th>
                  <th>Amount</th>
                  <th>Discount</th>
                  <th>Net Amount</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.rcdt}</td>
                    <td>{row.mrbillno}</td>
                    <td>{row.paidby}</td>
                    <td>₹{parseFloat(row.totalamt).toLocaleString('en-IN')}</td>
                    <td className="text-red-600">₹{parseFloat(row.discamt).toLocaleString('en-IN')}</td>
                    <td className="font-semibold">₹{parseFloat(row.netamt).toLocaleString('en-IN')}</td>
                    <td>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {row.remarks}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;