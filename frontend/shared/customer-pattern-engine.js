// @ts-nocheck
/**
 * CustomerPatternEngine
 * Shared Multi-Factor Predictive Pattern Recognition, Cadence & Depletion Engine.
 * Used across Billing (New Order / New Bill) and Customer Statement Portal (Self-Ordering Kiosk).
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CustomerPatternEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  /**
   * Calculate Period Sales (This Month, This Quarter, This Year, All Time)
   */
  function calculatePeriodSales(bills = []) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    let thisMonthTotal = 0;
    let thisMonthCount = 0;
    let thisQuarterTotal = 0;
    let thisQuarterCount = 0;
    let thisYearTotal = 0;
    let thisYearCount = 0;
    let allTimeTotal = 0;
    let allTimeCount = 0;

    bills.forEach(b => {
      const amt = Number(b.amount || b.total_amount || b.grand_total || b.total || 0);
      const dateVal = b.invoice_date || b.bill_date || b.created_at || b.date;
      const bDate = dateVal ? new Date(dateVal) : null;

      allTimeTotal += amt;
      allTimeCount++;

      if (bDate && !isNaN(bDate.getTime())) {
        const bYear = bDate.getFullYear();
        const bMonth = bDate.getMonth();
        const bQuarter = Math.floor(bMonth / 3);

        if (bYear === currentYear) {
          thisYearTotal += amt;
          thisYearCount++;

          if (bQuarter === currentQuarter) {
            thisQuarterTotal += amt;
            thisQuarterCount++;
          }

          if (bMonth === currentMonth) {
            thisMonthTotal += amt;
            thisMonthCount++;
          }
        }
      }
    });

    return {
      month: { total: thisMonthTotal, count: thisMonthCount },
      quarter: { total: thisQuarterTotal, count: thisQuarterCount },
      year: { total: thisYearTotal, count: thisYearCount },
      allTime: { total: allTimeTotal, count: allTimeCount }
    };
  }

  /**
   * Calculate Purchase Cadence & Average Bill Interval
   */
  function calculateBillCadence(bills = []) {
    if (!bills || bills.length === 0) {
      return {
        avgIntervalDays: 0,
        label: 'NO ORDERS',
        monthlyFrequency: 0,
        firstBillDate: null,
        lastBillDate: null,
        daysSinceLastBill: null
      };
    }

    const sortedDates = bills
      .map(b => {
        const dateVal = b.invoice_date || b.bill_date || b.created_at || b.date;
        return dateVal ? new Date(dateVal).getTime() : NaN;
      })
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (sortedDates.length === 0) {
      return { avgIntervalDays: 0, label: 'NO ORDERS', monthlyFrequency: 0, daysSinceLastBill: null };
    }

    const now = Date.now();
    const firstBillDate = new Date(sortedDates[0]);
    const lastBillDate = new Date(sortedDates[sortedDates.length - 1]);
    const daysSinceLastBill = Math.max(0, Math.floor((now - sortedDates[sortedDates.length - 1]) / (1000 * 60 * 60 * 24)));

    if (sortedDates.length === 1) {
      return {
        avgIntervalDays: 0,
        label: '1ST ORDER',
        monthlyFrequency: 1,
        firstBillDate,
        lastBillDate,
        daysSinceLastBill
      };
    }

    let totalIntervalDays = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      totalIntervalDays += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
    }

    const avgIntervalDays = Math.max(1, Math.round(totalIntervalDays / (sortedDates.length - 1)));
    const monthlyFrequency = parseFloat((30 / avgIntervalDays).toFixed(1));
    const label = avgIntervalDays === 1 ? 'EVERY 1 DAY' : `EVERY ${avgIntervalDays} DAYS`;

    return {
      avgIntervalDays,
      label,
      monthlyFrequency,
      firstBillDate,
      lastBillDate,
      daysSinceLastBill
    };
  }

  /**
   * Calculate Industrial Standard Trade Credit Limit & Available Buying Power
   * Formula: Avg Bill * max(1.5, (Settlement Days / Bill Interval) * 1.25)
   */
  function calculateCreditLimitAndBuyingPower(options = {}) {
    const {
      manualCreditLimit = null,
      avgBill = 0,
      currentDue = 0,
      settlementDays = 14,
      avgIntervalDays = 12
    } = options;

    let approvedCreditLimit = Number(manualCreditLimit) || 0;

    // If no manual limit is specified, use the industrial pipeline formula
    if (approvedCreditLimit <= 0) {
      if (avgBill > 0) {
        const interval = Math.max(1, avgIntervalDays);
        const pipelineRatio = Math.max(1.0, settlementDays / interval);
        // Multiplier ranges from 1.5x up to 2.5x pipeline benchmark
        const multiplier = Math.min(2.5, Math.max(1.5, pipelineRatio * 1.25));
        // Round to nearest 5,000 for clean wholesale limits
        approvedCreditLimit = Math.max(25000, Math.round((avgBill * multiplier) / 5000) * 5000);
      } else {
        approvedCreditLimit = 50000; // baseline default
      }
    }

    const utilized = Math.max(0, Number(currentDue) || 0);
    const available = Math.max(0, approvedCreditLimit - utilized);
    const utilizationPercent = Math.min(100, Math.round((utilized / (approvedCreditLimit || 1)) * 100));
    const availablePercent = Math.max(0, 100 - utilizationPercent);

    return {
      approvedCreditLimit,
      utilized,
      available,
      utilizationPercent,
      availablePercent,
      isExceeded: utilized > approvedCreditLimit
    };
  }

  /**
   * Multi-Factor Product Depletion & Purchase Pattern Recognition
   * Evaluates per-SKU repurchase cadence and depletion risk index.
   */
  function analyzeProductCadenceAndDepletion(billItems = [], suppressionDays = 0) {
    if (!billItems || !Array.isArray(billItems) || billItems.length === 0) {
      return [];
    }

    const now = Date.now();
    const productMap = {};

    billItems.forEach(item => {
      const key = String(item.product_id || item.productId || item.product_name || item.name || '').trim();
      if (!key) return;

      const dateVal = item.invoice_date || item.bill_date || item.created_at || item.timestamp;
      const itemDate = dateVal ? new Date(dateVal).getTime() : now;
      const qty = Math.max(1, Number(item.qty || item.quantity || 1));
      const rate = Number(item.rate || item.price || item.unit_price || 0);

      if (!productMap[key]) {
        productMap[key] = {
          productId: item.product_id || item.productId || key,
          name: item.product_name || item.name || key,
          variant: item.variant || item.pack_value || '',
          rate,
          totalQty: 0,
          purchaseDates: [],
          orderCount: 0
        };
      }

      productMap[key].orderCount++;
      productMap[key].totalQty += qty;
      if (rate > 0) productMap[key].rate = rate;
      if (!isNaN(itemDate)) {
        productMap[key].purchaseDates.push(itemDate);
      }
    });

    const suggestions = Object.values(productMap).map(p => {
      // Sort dates chronologically
      p.purchaseDates.sort((a, b) => a - b);
      const lastDate = p.purchaseDates[p.purchaseDates.length - 1] || now;
      const daysSinceLast = Math.max(0, Math.floor((now - lastDate) / (1000 * 60 * 60 * 24)));

      // Calculate SKU specific cadence
      let skuCadenceDays = 14; // default
      if (p.purchaseDates.length >= 2) {
        let totalGap = 0;
        for (let i = 1; i < p.purchaseDates.length; i++) {
          totalGap += (p.purchaseDates[i] - p.purchaseDates[i - 1]) / (1000 * 60 * 60 * 24);
        }
        skuCadenceDays = Math.max(2, Math.round(totalGap / (p.purchaseDates.length - 1)));
      } else {
        // Single purchase heuristic based on quantity
        skuCadenceDays = Math.max(7, Math.min(45, p.totalQty * 4));
      }

      // Depletion Index D_p: ratio of days passed to expected cadence
      const depletionIndex = parseFloat((daysSinceLast / (skuCadenceDays || 1)).toFixed(2));
      const isDepletedSoon = depletionIndex >= 0.85;
      const isOverdue = depletionIndex >= 1.10;

      // Recommended reorder quantity based on average order size
      const avgQtyPerOrder = Math.max(1, Math.round(p.totalQty / p.orderCount));

      // Multi-factor recommendation score
      // High frequency + high depletion urgency + recent engagement
      const urgencyScore = Math.min(50, Math.round(depletionIndex * 30));
      const frequencyScore = Math.min(40, p.orderCount * 8);
      const score = frequencyScore + urgencyScore + Math.max(0, 30 - Math.min(30, daysSinceLast));

      return {
        productId: p.productId,
        name: p.name,
        variant: p.variant,
        rate: p.rate,
        orderCount: p.orderCount,
        totalQty: p.totalQty,
        avgQtyPerOrder,
        daysSinceLast,
        skuCadenceDays,
        depletionIndex,
        isDepletedSoon,
        isOverdue,
        score
      };
    });

    return suggestions
      .filter(s => suppressionDays === 0 || s.daysSinceLast >= suppressionDays)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Market Basket / Co-Occurrence Affinity
   * Analyzes items frequently bought together in the same invoice for upsells.
   */
  function calculateCooccurrence(billItems = []) {
    const invoiceBaskets = {};

    billItems.forEach(item => {
      const invId = item.invoice_id || item.invoice_no || item.bill_id || 'default';
      const prodName = String(item.product_name || item.name || '').trim();
      if (!prodName) return;

      if (!invoiceBaskets[invId]) invoiceBaskets[invId] = new Set();
      invoiceBaskets[invId].add(prodName);
    });

    const cooccurMatrix = {};

    Object.values(invoiceBaskets).forEach(basketSet => {
      const items = Array.from(basketSet);
      for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const a = items[i];
          const b = items[j];
          if (!cooccurMatrix[a]) cooccurMatrix[a] = {};
          cooccurMatrix[a][b] = (cooccurMatrix[a][b] || 0) + 1;
        }
      }
    });

    return cooccurMatrix;
  }

  return {
    calculatePeriodSales,
    calculateBillCadence,
    calculateCreditLimitAndBuyingPower,
    analyzeProductCadenceAndDepletion,
    calculateCooccurrence
  };
});
