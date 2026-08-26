package com.example.macosbusinesssuite.domain.calculation

import com.example.macosbusinesssuite.data.model.*
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

object DashboardCalculator {

    fun getPresetDateRange(
        preset: MetricsDatePreset,
        customStartStr: String = "",
        customEndStr: String = "",
        now: Date = Date()
    ): Pair<Date?, Date?> {
        val cal = Calendar.getInstance()
        cal.time = now

        return when (preset) {
            MetricsDatePreset.THIS_MONTH -> {
                cal.set(Calendar.DAY_OF_MONTH, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                val start = cal.time

                cal.add(Calendar.MONTH, 1)
                cal.add(Calendar.MILLISECOND, -1)
                val end = cal.time
                Pair(start, end)
            }
            MetricsDatePreset.LAST_MONTH -> {
                cal.set(Calendar.DAY_OF_MONTH, 1)
                cal.add(Calendar.MONTH, -1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                val start = cal.time

                cal.add(Calendar.MONTH, 1)
                cal.add(Calendar.MILLISECOND, -1)
                val end = cal.time
                Pair(start, end)
            }
            MetricsDatePreset.THIS_QUARTER -> {
                val currentMonth = cal.get(Calendar.MONTH)
                val quarterStartMonth = (currentMonth / 3) * 3
                cal.set(Calendar.MONTH, quarterStartMonth)
                cal.set(Calendar.DAY_OF_MONTH, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                val start = cal.time

                cal.add(Calendar.MONTH, 3)
                cal.add(Calendar.MILLISECOND, -1)
                val end = cal.time
                Pair(start, end)
            }
            MetricsDatePreset.THIS_YEAR -> {
                cal.set(Calendar.DAY_OF_YEAR, 1)
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                val start = cal.time

                cal.set(Calendar.MONTH, 11)
                cal.set(Calendar.DAY_OF_MONTH, 31)
                cal.set(Calendar.HOUR_OF_DAY, 23)
                cal.set(Calendar.MINUTE, 59)
                cal.set(Calendar.SECOND, 59)
                cal.set(Calendar.MILLISECOND, 999)
                val end = cal.time
                Pair(start, end)
            }
            MetricsDatePreset.CUSTOM -> {
                val start = FifoSettlementCalculator.parseDate(customStartStr)
                val end = FifoSettlementCalculator.parseDate(customEndStr)
                Pair(start, end)
            }
            MetricsDatePreset.ALL -> Pair(null, null)
        }
    }

    fun formatDateRangeText(startDate: Date?, endDate: Date?, earliestDate: Date?): String {
        val df = SimpleDateFormat("dd MMM yyyy", Locale.US)
        val startStr = startDate?.let { df.format(it) } ?: earliestDate?.let { df.format(it) } ?: "Beginning"
        val endStr = endDate?.let { df.format(it) } ?: df.format(Date())
        return "From $startStr to $endStr"
    }

    fun calculateKeyMetrics(
        bills: List<Bill>,
        payments: List<PaymentRecord>,
        contacts: List<Contact>,
        preset: MetricsDatePreset,
        customStart: String = "",
        customEnd: String = ""
    ): DashboardKeyMetrics {
        val excludedIds = contacts.filter { it.excludeFromStats == 1 }.map { it.id }.toSet()
        val filteredContacts = contacts.filter { it.excludeFromStats != 1 }
        val filteredBills = bills.filter { it.customerId == null || !excludedIds.contains(it.customerId) }
        val filteredPayments = payments.filter { it.customerId == null || !excludedIds.contains(it.customerId) }

        val (startDate, endDate) = getPresetDateRange(preset, customStart, customEnd)

        var earliestBillDate: Date? = null
        filteredBills.forEach { b ->
            FifoSettlementCalculator.parseDate(b.date)?.let { d ->
                if (earliestBillDate == null || d.before(earliestBillDate)) {
                    earliestBillDate = d
                }
            }
        }

        val rangeBills = filteredBills.filter { b ->
            val d = FifoSettlementCalculator.parseDate(b.date)
            d != null && (startDate == null || !d.before(startDate)) && (endDate == null || !d.after(endDate))
        }

        val rangePayments = filteredPayments.filter { p ->
            val dateStr = p.paymentDate.ifEmpty { p.createdAt ?: "" }
            val d = FifoSettlementCalculator.parseDate(dateStr)
            d != null && (startDate == null || !d.before(startDate)) && (endDate == null || !d.after(endDate))
        }

        val totalOpeningBalance = filteredContacts.sumOf { it.openingBalance }
        val includeOpening = (preset == MetricsDatePreset.ALL)
        val activeOpeningBalance = if (includeOpening) totalOpeningBalance else 0.0

        val totalBilled = rangeBills.sumOf { it.grandTotal } + activeOpeningBalance
        val totalPaid = rangePayments.sumOf { it.effectiveAmount }

        val amountDue = Math.max(0.0, totalBilled - totalPaid)
        val billBalances = FifoSettlementCalculator.calculateBillBalances(filteredBills, filteredPayments, filteredContacts)
        
        val now = Date()
        var totalOverdue = 0.0
        filteredBills.forEach { bill ->
            val remaining = billBalances[bill.id] ?: 0.0
            if (remaining > 0.01) {
                val billDate = FifoSettlementCalculator.parseDate(bill.date)
                if (billDate != null) {
                    val daysAgo = ((now.time - billDate.time) / (1000 * 60 * 60 * 24)).toInt()
                    if (daysAgo > 30) {
                        totalOverdue += remaining
                    }
                }
            }
        }

        val activeCustomers = (rangeBills.mapNotNull { it.customerId ?: it.customerName } +
                rangePayments.mapNotNull { it.customerId ?: it.customerName }).toSet().size

        val collectionRate = if (totalBilled > 0) (totalPaid / totalBilled) * 100.0 else 0.0

        return DashboardKeyMetrics(
            totalBilled = totalBilled,
            totalBillsCount = rangeBills.size,
            totalCollected = totalPaid,
            paymentsCount = rangePayments.size,
            amountDue = amountDue,
            overdueAmount = totalOverdue,
            activeCustomersCount = activeCustomers,
            collectionRatePercent = collectionRate,
            rangeText = formatDateRangeText(startDate, endDate, earliestBillDate)
        )
    }

    fun calculateOrderMetrics(
        orders: List<OrderRecord>,
        bills: List<Bill>,
        payments: List<PaymentRecord>,
        contacts: List<Contact>,
        preset: MetricsDatePreset,
        customStart: String = "",
        customEnd: String = ""
    ): Pair<DashboardOrderMetrics, ReceivablesAging> {
        val excludedIds = contacts.filter { it.excludeFromStats == 1 }.map { it.id }.toSet()
        val filteredContacts = contacts.filter { it.excludeFromStats != 1 }
        val filteredOrders = orders.filter { it.customerId == null || !excludedIds.contains(it.customerId) }
        val filteredBills = bills.filter { it.customerId == null || !excludedIds.contains(it.customerId) }
        val filteredPayments = payments.filter { it.customerId == null || !excludedIds.contains(it.customerId) }

        val (startDate, endDate) = getPresetDateRange(preset, customStart, customEnd)

        var earliestOrderDate: Date? = null
        filteredOrders.forEach { o ->
            FifoSettlementCalculator.parseDate(o.orderDate)?.let { d ->
                if (earliestOrderDate == null || d.before(earliestOrderDate)) {
                    earliestOrderDate = d
                }
            }
        }

        val periodOrders = filteredOrders.filter { o ->
            val d = FifoSettlementCalculator.parseDate(o.orderDate)
            d != null && (startDate == null || !d.before(startDate)) && (endDate == null || !d.after(endDate))
        }

        val totalOrders = periodOrders.size
        val fulfilledOrders = periodOrders.filter { it.status == "complete" || it.currentStage == "stage3" }
        val fulfilledCount = fulfilledOrders.size

        val stage1Count = periodOrders.count { it.currentStage == "stage1" }
        val stage2Count = periodOrders.count { it.currentStage == "stage2" }
        val pendingCount = stage1Count + stage2Count

        var totalOrderedQty = 0
        var totalDeliveredQty = 0
        var totalDeliveredValue = 0.0
        var totalLostValue = 0.0

        periodOrders.forEach { o ->
            val isFulfilled = o.currentStage == "stage3" || o.status == "complete"
            
            if (o.items.isNotEmpty()) {
                o.items.forEach { item ->
                    val oQty = if (item.orderedQty > 0) item.orderedQty.toInt() else 1
                    val rQty = if (isFulfilled) (if (item.receivedQty > 0) item.receivedQty.toInt() else oQty) else 0
                    val lostQty = Math.max(0, oQty - rQty)
                    val itemRate = if (item.rate > 0) item.rate else if (oQty > 0) item.amount / oQty else 0.0

                    totalOrderedQty += oQty
                    totalDeliveredQty += rQty
                    if (isFulfilled) {
                        totalDeliveredValue += (rQty * itemRate)
                        totalLostValue += (lostQty * itemRate)
                    }
                }
            } else {
                val qty = 1
                val recQty = if (isFulfilled) 1 else 0
                val valAmt = o.totalAmount

                totalOrderedQty += qty
                totalDeliveredQty += recQty
                if (isFulfilled) {
                    totalDeliveredValue += valAmt
                }
            }
        }

        val totalOrderedValue = periodOrders.sumOf { it.totalAmount }
        if (totalDeliveredValue <= 0.0 && fulfilledOrders.isNotEmpty()) {
            totalDeliveredValue = fulfilledOrders.sumOf { it.totalAmount }
        }

        val billBalances = FifoSettlementCalculator.calculateBillBalances(filteredBills, filteredPayments, filteredContacts)
        var totalPaidOnOrders = 0.0

        periodOrders.forEach { o ->
            val matchingBill = filteredBills.find { 
                it.billNumber.equals(o.orderNumber, ignoreCase = true) || 
                it.id.equals(o.id, ignoreCase = true) ||
                (it.customerId != null && it.customerId == o.customerId)
            }
            if (matchingBill != null) {
                val remaining = billBalances[matchingBill.id] ?: matchingBill.grandTotal
                val paidOnOrder = Math.max(0.0, matchingBill.grandTotal - remaining)
                totalPaidOnOrders += paidOnOrder
            }
        }

        val fulfillmentQtyRatio = if (totalOrderedQty > 0) (totalDeliveredQty.toDouble() / totalOrderedQty) * 100.0 else 0.0
        val settlementPaidRatio = if (totalDeliveredValue > 0) (totalPaidOnOrders / totalDeliveredValue) * 100.0 else 0.0
        val avgOrderValue = if (totalOrders > 0) totalOrderedValue / totalOrders else 0.0

        // Receivables Aging
        val now = Date()
        var outstanding0to30 = 0.0
        var outstanding31to60 = 0.0
        var outstanding61Plus = 0.0

        filteredBills.forEach { bill ->
            val remaining = billBalances[bill.id] ?: 0.0
            if (remaining > 0.01) {
                val billDate = FifoSettlementCalculator.parseDate(bill.date)
                if (billDate != null) {
                    val daysAgo = ((now.time - billDate.time) / (1000 * 60 * 60 * 24)).toInt()
                    when {
                        daysAgo <= 30 -> outstanding0to30 += remaining
                        daysAgo <= 60 -> outstanding31to60 += remaining
                        else -> outstanding61Plus += remaining
                    }
                }
            }
        }

        val receivablesAging = ReceivablesAging(
            outstanding0to30 = outstanding0to30,
            outstanding31to60 = outstanding31to60,
            outstanding61Plus = outstanding61Plus,
            totalOutstanding = outstanding0to30 + outstanding31to60 + outstanding61Plus
        )

        // Calculate dynamic fulfillment speed (orderDate to deliveryDate)
        var totalFulfillmentDays = 0.0
        var countWithDeliveryDate = 0
        fulfilledOrders.forEach { o ->
            val oDate = FifoSettlementCalculator.parseDate(o.orderDate)
            val dDate = FifoSettlementCalculator.parseDate(o.deliveryDate)
            if (oDate != null && dDate != null) {
                val diffDays = (dDate.time - oDate.time).toDouble() / (1000 * 60 * 60 * 24)
                if (diffDays >= 0) {
                    totalFulfillmentDays += diffDays
                    countWithDeliveryDate++
                }
            }
        }
        val speedText = if (countWithDeliveryDate > 0) {
            "${String.format(Locale.US, "%.1f", totalFulfillmentDays / countWithDeliveryDate)} Days"
        } else "N/A"

        val orderMetrics = DashboardOrderMetrics(
            totalOrders = totalOrders,
            fulfilledOrdersCount = fulfilledCount,
            pendingOrdersCount = pendingCount,
            draftCount = stage1Count,
            qualityCheckCount = stage2Count,
            fulfillmentQtyRatio = fulfillmentQtyRatio,
            totalDeliveredQty = totalDeliveredQty,
            totalOrderedQty = totalOrderedQty,
            settlementPaidRatio = settlementPaidRatio,
            totalPaidOnOrders = totalPaidOnOrders,
            totalDeliveredValue = totalDeliveredValue,
            totalOrderedValue = totalOrderedValue,
            avgOrderValue = avgOrderValue,
            totalLostValue = totalLostValue,
            fulfillmentSpeedDaysText = speedText,
            rangeText = formatDateRangeText(startDate, endDate, earliestOrderDate)
        )

        return Pair(orderMetrics, receivablesAging)
    }

    fun calculateTopPerformers(
        bills: List<Bill>,
        orders: List<OrderRecord>,
        payments: List<PaymentRecord>,
        contacts: List<Contact>,
        preset: MetricsDatePreset,
        customStart: String = "",
        customEnd: String = ""
    ): Pair<List<TopProductPerformer>, List<TopCustomerPerformer>> {
        val excludedIds = contacts.filter { it.excludeFromStats == 1 }.map { it.id }.toSet()
        val filteredContacts = contacts.filter { it.excludeFromStats != 1 }
        val filteredBills = bills.filter { it.customerId == null || !excludedIds.contains(it.customerId) }
        val filteredPayments = payments.filter { it.customerId == null || !excludedIds.contains(it.customerId) }
        val filteredOrders = orders.filter { it.customerId == null || !excludedIds.contains(it.customerId) }

        val (startDate, endDate) = getPresetDateRange(preset, customStart, customEnd)

        val periodBills = filteredBills.filter { b ->
            val d = FifoSettlementCalculator.parseDate(b.date)
            d != null && (startDate == null || !d.before(startDate)) && (endDate == null || !d.after(endDate))
        }

        val periodOrders = filteredOrders.filter { o ->
            val d = FifoSettlementCalculator.parseDate(o.orderDate)
            d != null && (startDate == null || !d.before(startDate)) && (endDate == null || !d.after(endDate))
        }

        // Top Products
        val productMap = mutableMapOf<String, TopProductPerformer>()
        periodBills.forEach { bill ->
            bill.items.forEach { item ->
                val name = item.productName.ifEmpty { "Product" }
                val current = productMap[name] ?: TopProductPerformer(name = name)
                val qty = item.quantity.toInt()
                val rev = if (item.amount > 0) item.amount else item.rate * item.quantity
                productMap[name] = current.copy(
                    quantity = current.quantity + qty,
                    revenue = current.revenue + rev
                )
            }
        }
        val topProducts = productMap.values.sortedByDescending { it.revenue }.take(5)

        // Top Customers
        val billBalances = FifoSettlementCalculator.calculateBillBalances(filteredBills, filteredPayments, filteredContacts)
        val customerMap = mutableMapOf<String, TopCustomerPerformer>()

        periodBills.forEach { bill ->
            val cId = bill.customerId ?: bill.customerName
            val cName = bill.customerName
            val current = customerMap[cId] ?: TopCustomerPerformer(id = cId, name = cName)
            customerMap[cId] = current.copy(billed = current.billed + bill.grandTotal)
        }

        periodOrders.forEach { order ->
            val cId = order.customerId ?: order.customerName
            val cName = order.customerName
            val current = customerMap[cId] ?: TopCustomerPerformer(id = cId, name = cName)
            customerMap[cId] = current.copy(ordersCount = current.ordersCount + 1)
        }

        customerMap.keys.forEach { cId ->
            val cBills = filteredBills.filter { (it.customerId ?: it.customerName) == cId }
            var due = 0.0
            cBills.forEach { b ->
                due += (billBalances[b.id] ?: 0.0)
            }
            val item = customerMap[cId]
            if (item != null) {
                customerMap[cId] = item.copy(dueBalance = due)
            }
        }

        val topCustomers = customerMap.values.sortedByDescending { it.billed }.take(5)

        return Pair(topProducts, topCustomers)
    }

    fun generateTickerItems(
        keyMetrics: DashboardKeyMetrics,
        reminders: List<OverdueBillReminder>,
        topProducts: List<TopProductPerformer>,
        topCustomers: List<TopCustomerPerformer>
    ): List<TopbarTickerItem> {
        val items = mutableListOf<TopbarTickerItem>()
        items.add(TopbarTickerItem("Total Revenue: ₹${String.format(Locale.US, "%.0f", keyMetrics.totalBilled)}", "key-metrics"))
        items.add(TopbarTickerItem("Total Bills: ${keyMetrics.totalBillsCount}", "key-metrics"))
        items.add(TopbarTickerItem("Amount Due: ₹${String.format(Locale.US, "%.0f", keyMetrics.amountDue)}", "key-metrics"))
        items.add(TopbarTickerItem("Overdue Amount: ₹${String.format(Locale.US, "%.0f", keyMetrics.overdueAmount)}", "payment-reminders"))

        topCustomers.firstOrNull()?.let {
            items.add(TopbarTickerItem("Top Customer: ${it.name} (₹${String.format(Locale.US, "%.0f", it.billed)})", "top-performers"))
        }

        reminders.take(2).forEach { r ->
            items.add(TopbarTickerItem("⚠️ Payment Due: ${r.customerName} ₹${String.format(Locale.US, "%.0f", r.remainingAmount)} (${r.daysOverdue}d overdue)", "payment-reminders"))
        }

        return items
    }
}
