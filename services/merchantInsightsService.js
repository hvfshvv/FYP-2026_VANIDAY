const PERIOD_OPTIONS = new Set(['7d', '30d', 'month']);

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveInsightPeriod(value, now = new Date()) {
  const key = PERIOD_OPTIONS.has(value) ? value : '30d';
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start;
  let label;

  if (key === '7d') {
    start = addDays(end, -6);
    label = 'Last 7 days';
  } else if (key === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
    end.setMonth(end.getMonth() + 1, 0);
    label = 'This month';
  } else {
    start = addDays(end, -29);
    label = 'Last 30 days';
  }

  const dayCount = Math.round((end - start) / 86400000) + 1;
  let previousEnd;
  let previousStart;
  if (key === 'month') {
    previousStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const previousMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    previousEnd = new Date(
      end.getFullYear(),
      end.getMonth() - 1,
      Math.min(end.getDate(), previousMonthLastDay)
    );
  } else {
    previousEnd = addDays(start, -1);
    previousStart = addDays(previousEnd, -(dayCount - 1));
  }

  return {
    key,
    label,
    startDate: localDateString(start),
    endDate: localDateString(end),
    previousStartDate: localDateString(previousStart),
    previousEndDate: localDateString(previousEnd),
  };
}

function dateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return localDateString(new Date(value));
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function summarizeRows(rows, periodStart = '') {
  const services = new Map();
  const staff = new Map();
  const demand = new Map();
  const customers = new Set();
  const returningCustomers = new Set();
  const newCustomers = new Set();
  const ratings = [];
  let revenue = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  let paidBookings = 0;

  rows.forEach(row => {
    const paidAmount = row.payment_status === 'paid' ? Number(row.paid_amount || 0) : 0;
    revenue += paidAmount;
    paidBookings += row.payment_status === 'paid' ? 1 : 0;
    if (row.status === 'completed') completed += 1;
    if (row.status === 'cancelled') cancelled += 1;
    if (row.status === 'no_show') noShow += 1;
    if (row.rating != null) ratings.push(Number(row.rating));

    if (row.customer_id != null) {
      customers.add(String(row.customer_id));
      if (dateOnly(row.first_booking_date) >= periodStart) {
        newCustomers.add(String(row.customer_id));
      } else {
        returningCustomers.add(String(row.customer_id));
      }
    }

    const serviceKey = String(row.service_id);
    const serviceItem = services.get(serviceKey) || {
      serviceId: row.service_id,
      name: row.service_name,
      bookings: 0,
      bookingAttempts: 0,
      revenue: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
    };
    serviceItem.bookingAttempts += 1;
    serviceItem.bookings += row.status === 'cancelled' ? 0 : 1;
    serviceItem.revenue += paidAmount;
    serviceItem.completed += row.status === 'completed' ? 1 : 0;
    serviceItem.cancelled += row.status === 'cancelled' ? 1 : 0;
    serviceItem.noShow += row.status === 'no_show' ? 1 : 0;
    services.set(serviceKey, serviceItem);

    if (row.staff_id != null) {
      const staffKey = String(row.staff_id);
      const staffItem = staff.get(staffKey) || {
        staffId: row.staff_id,
        name: row.staff_name || 'Staff member',
        bookings: 0,
        completed: 0,
        revenue: 0,
      };
      staffItem.bookings += row.status === 'cancelled' ? 0 : 1;
      staffItem.completed += row.status === 'completed' ? 1 : 0;
      staffItem.revenue += paidAmount;
      staff.set(staffKey, staffItem);
    }

    if (row.status !== 'cancelled') {
      const bookingDate = new Date(`${dateOnly(row.booking_date)}T00:00:00`);
      const day = bookingDate.toLocaleDateString('en-SG', { weekday: 'short' });
      const hour = String(row.booking_time || '').slice(0, 2).padStart(2, '0');
      const demandKey = `${day} ${hour}:00`;
      demand.set(demandKey, (demand.get(demandKey) || 0) + 1);
    }
  });

  const totalBookings = rows.filter(row => row.status !== 'cancelled').length;
  const unsuccessful = cancelled + noShow;
  const finished = completed + unsuccessful;
  const servicePerformance = [...services.values()]
    .map(item => ({
      ...item,
      revenue: round(item.revenue, 2),
      issueRate: item.bookingAttempts ? round(((item.cancelled + item.noShow) / item.bookingAttempts) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
  const staffPerformance = [...staff.values()]
    .map(item => ({ ...item, revenue: round(item.revenue, 2) }))
    .sort((a, b) => b.completed - a.completed || b.revenue - a.revenue);
  const demandPeriods = [...demand.entries()]
    .map(([label, bookings]) => ({ label, bookings }))
    .sort((a, b) => b.bookings - a.bookings || a.label.localeCompare(b.label));

  return {
    totalBookings,
    revenue: round(revenue, 2),
    averageOrderValue: paidBookings ? round(revenue / paidBookings, 2) : 0,
    completed,
    cancelled,
    noShow,
    cancellationNoShowRate: finished ? round((unsuccessful / finished) * 100) : 0,
    uniqueCustomers: customers.size,
    newCustomers: newCustomers.size,
    returningCustomers: returningCustomers.size,
    retentionRate: customers.size ? round((returningCustomers.size / customers.size) * 100) : 0,
    averageRating: ratings.length ? round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : 0,
    reviewCount: ratings.length,
    servicePerformance,
    staffPerformance,
    demandPeriods,
  };
}

function buildRecommendations(metrics) {
  const recommendations = [];
  const topService = metrics.servicePerformance[0];
  const highIssueService = [...metrics.servicePerformance]
    .filter(item => item.bookingAttempts >= 3)
    .sort((a, b) => b.issueRate - a.issueRate)[0];
  const peak = metrics.demandPeriods[0];
  const quiet = [...metrics.demandPeriods].reverse().find(item => item.bookings > 0);

  if (metrics.cancellationNoShowRate >= 20 && metrics.totalBookings >= 5) {
    recommendations.push({
      priority: 'high',
      title: 'Reduce cancellations and no-shows',
      evidence: `${metrics.cancellationNoShowRate}% of finished bookings were cancelled or marked no-show.`,
      action: 'Confirm appointments earlier and remind customers about simple rescheduling options.',
      href: '/merchant/bookings#booking-list',
      actionLabel: 'Review bookings',
    });
  }
  if (highIssueService && highIssueService.issueRate >= 20) {
    recommendations.push({
      priority: 'high',
      title: `Review ${highIssueService.name}`,
      evidence: `${highIssueService.issueRate}% cancellation/no-show rate across ${highIssueService.bookingAttempts} recorded bookings.`,
      action: 'Check the service duration, price, preparation instructions and staff availability.',
      href: `/merchant/services?focus=${highIssueService.serviceId}#service-${highIssueService.serviceId}`,
      actionLabel: 'Review service',
    });
  }
  if (peak && peak.bookings >= 2) {
    recommendations.push({
      priority: 'medium',
      title: `Plan staffing around ${peak.label}`,
      evidence: `${peak.bookings} bookings made this your busiest recorded time.`,
      action: 'Keep enough staff available and avoid scheduling administrative work at this time.',
      href: '/merchant/availability',
      actionLabel: 'Review opening hours',
    });
  } else if (peak) {
    recommendations.push({
      priority: 'low',
      title: `Watch demand around ${peak.label}`,
      evidence: 'One booking was recorded at this time, but there is not enough data to call it a regular peak.',
      action: 'Keep your usual staffing for now and check whether more bookings appear at this time.',
      href: '/merchant/availability',
      actionLabel: 'Review opening hours',
    });
  }
  if (topService) {
    const bookingWord = topService.bookings === 1 ? 'booking' : 'bookings';
    recommendations.push({
      priority: 'medium',
      title: `Keep ${topService.name} visible`,
      evidence: `${topService.name} generated S$${topService.revenue.toFixed(2)} from ${topService.bookings} ${bookingWord}.`,
      action: 'Make this service easy to find and monitor whether demand continues before creating a promotion.',
      href: `/merchant/services?focus=${topService.serviceId}#service-${topService.serviceId}`,
      actionLabel: 'Review service listing',
    });
  }
  if (metrics.uniqueCustomers >= 5 && metrics.retentionRate < 30) {
    recommendations.push({
      priority: 'medium',
      title: 'Encourage customers to return',
      evidence: `${metrics.retentionRate}% of customers in this period were returning customers.`,
      action: 'Follow up after completed appointments and consider a returning-customer offer.',
      href: '/merchant/promotions?goal=returning-customers#new-promotion',
      actionLabel: 'Create return offer',
    });
  }
  if (metrics.averageRating && metrics.averageRating < 4) {
    recommendations.push({
      priority: 'high',
      title: 'Review recent customer feedback',
      evidence: `Your average rating is ${metrics.averageRating.toFixed(1)}/5 from ${metrics.reviewCount} reviews.`,
      action: 'Reply to reviews and look for repeated concerns that can be addressed operationally.',
      href: '/merchant/reviews',
      actionLabel: 'Read reviews',
    });
  }
  if (quiet && metrics.demandPeriods.length >= 4) {
    recommendations.push({
      priority: 'low',
      title: `Test demand around ${quiet.label}`,
      evidence: `Only ${quiet.bookings} booking${quiet.bookings === 1 ? '' : 's'} occurred in this recorded period.`,
      action: 'Try a small off-peak promotion before making permanent pricing changes.',
      href: '/merchant/promotions?goal=off-peak#new-promotion',
      actionLabel: 'Create off-peak offer',
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      priority: 'low',
      title: 'Collect more booking data',
      evidence: `Only ${metrics.totalBookings} booking${metrics.totalBookings === 1 ? '' : 's'} were recorded in this period.`,
      action: 'Continue using Uniday for bookings so trends and recommendations become more reliable.',
      href: '/merchant/services',
      actionLabel: 'Review services',
    });
  }
  return recommendations.slice(0, 5);
}

function buildMerchantInsights(rows, period) {
  const currentRows = rows.filter(row => {
    const date = dateOnly(row.booking_date);
    return date >= period.startDate && date <= period.endDate;
  });
  const previousRows = rows.filter(row => {
    const date = dateOnly(row.booking_date);
    return date >= period.previousStartDate && date <= period.previousEndDate;
  });
  const current = summarizeRows(currentRows, period.startDate);
  const previous = summarizeRows(previousRows, period.previousStartDate);

  current.comparison = {
    revenue: percentChange(current.revenue, previous.revenue),
    bookings: percentChange(current.totalBookings, previous.totalBookings),
    customers: percentChange(current.uniqueCustomers, previous.uniqueCustomers),
    averageOrderValue: percentChange(current.averageOrderValue, previous.averageOrderValue),
  };

  return {
    period,
    metrics: current,
    previous,
    recommendations: buildRecommendations(current),
    sampleSizeWarning: current.totalBookings < 5,
  };
}

module.exports = {
  resolveInsightPeriod,
  summarizeRows,
  buildRecommendations,
  buildMerchantInsights,
};
