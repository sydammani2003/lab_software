import { supabase } from '../lib/supabase';

export class AnalyticsService {
  // Fetch receipts with optional date filtering
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

  // Real-time subscription
  static subscribeToReceipts(callback) {
    const subscription = supabase
      .channel('moneyreciept-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moneyreciept' },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }

  // Calculate KPIs
  static calculateKPIs(data, previousData = []) {
    if (!data || data.length === 0) {
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        avgTransactionValue: 0,
        totalDiscount: 0,
        outstandingDue: 0,
        trends: {}
      };
    }

    const totalRevenue = data.reduce((sum, r) => sum + parseFloat(r.netamt || 0), 0);
    const totalDiscount = data.reduce((sum, r) => sum + parseFloat(r.discamt || 0), 0);
    const outstandingDue = data.reduce((sum, r) => sum + parseFloat(r.due || 0), 0);
    
    // Calculate trends if previous data exists
    const trends = {};
    if (previousData.length > 0) {
      const prevRevenue = previousData.reduce((sum, r) => sum + parseFloat(r.netamt || 0), 0);
      trends.revenue = ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1);
      trends.transactions = ((data.length - previousData.length) / previousData.length * 100).toFixed(1);
    }

    return {
      totalRevenue,
      totalTransactions: data.length,
      avgTransactionValue: totalRevenue / data.length,
      totalDiscount,
      outstandingDue,
      trends
    };
  }

  // Prepare time-series data
  static prepareChartData(data) {
    if (!data || data.length === 0) return [];

    const dateGroups = data.reduce((acc, item) => {
      const date = item.rcdt;
      if (!acc[date]) {
        acc[date] = {
          date,
          revenue: 0,
          transactions: 0,
          discount: 0,
          totalAmount: 0
        };
      }
      acc[date].revenue += parseFloat(item.netamt || 0);
      acc[date].totalAmount += parseFloat(item.totalamt || 0);
      acc[date].transactions += 1;
      acc[date].discount += parseFloat(item.discamt || 0);
      return acc;
    }, {});

    return Object.values(dateGroups).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
  }

  // Payment method distribution
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

  // Top users by revenue
  static prepareUserDistribution(data, limit = 10) {
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

    return Object.values(users)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  // Export to CSV
  static exportToCSV(data, filename = 'analytics-export') {
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape values containing commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}