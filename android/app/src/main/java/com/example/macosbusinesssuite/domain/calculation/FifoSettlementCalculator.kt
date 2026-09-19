package com.example.macosbusinesssuite.domain.calculation

import com.example.macosbusinesssuite.data.model.Bill
import com.example.macosbusinesssuite.data.model.Contact
import com.example.macosbusinesssuite.data.model.OverdueBillReminder
import com.example.macosbusinesssuite.data.model.PaymentRecord
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

object FifoSettlementCalculator {

    private val dateParsers = listOf(
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US),
        SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US),
        SimpleDateFormat("yyyy-MM-dd", Locale.US),
        SimpleDateFormat("dd-MM-yyyy", Locale.US),
        SimpleDateFormat("dd/MM/yyyy", Locale.US),
        SimpleDateFormat("MM/dd/yyyy", Locale.US),
        SimpleDateFormat("yyyy/MM/dd", Locale.US)
    )

    fun parseDate(dateStr: String?): Date? {
        if (dateStr.isNullOrBlank()) return null
        val trimmed = dateStr.trim()
        
        // Check numeric timestamp
        trimmed.toLongOrNull()?.let {
            return Date(it)
        }

        val formattedStr = if (trimmed.contains(" ") && !trimmed.contains("T")) {
            trimmed.replace(" ", "T")
        } else trimmed

        for (parser in dateParsers) {
            try {
                return parser.parse(formattedStr)
            } catch (_: Exception) {}
        }
        return null
    }

    private class PaymentQueueItem(
        val id: String,
        val total: Double,
        var remaining: Double
    )

    fun getCustomerKey(customerId: String?, customerName: String?, contacts: List<Contact>): String {
        if (!customerId.isNullOrBlank()) {
            val byId = contacts.find { it.id == customerId }
            if (byId != null) return byId.id
        }
        if (!customerName.isNullOrBlank()) {
            val byName = contacts.find { it.name.equals(customerName, ignoreCase = true) }
            if (byName != null) return byName.id
            return customerName.trim().lowercase(Locale.US)
        }
        return customerId ?: "unknown"
    }

    /**
     * Calculate remaining unpaid balance for each bill using FIFO settlement.
     * Returns Map of billId -> remainingBalance
     */
    fun calculateBillBalances(
        bills: List<Bill>,
        payments: List<PaymentRecord>,
        contacts: List<Contact>
    ): Map<String, Double> {
        val excludedContactIds = contacts
            .filter { it.excludeFromStats == 1 }
            .map { it.id }
            .toSet()

        val filteredBills = bills.filter { it.customerId == null || !excludedContactIds.contains(it.customerId) }
        val filteredPayments = payments.filter { it.customerId == null || !excludedContactIds.contains(it.customerId) }
        val contactMap = contacts.filter { it.excludeFromStats != 1 }.associateBy { it.id }

        val customerBills = filteredBills.groupBy { getCustomerKey(it.customerId, it.customerName, contacts) }
        val customerPayments = filteredPayments.groupBy { getCustomerKey(it.customerId, it.customerName, contacts) }

        val billBalances = mutableMapOf<String, Double>()

        val allCustomerKeys = (customerBills.keys + customerPayments.keys).toSet()

        for (custId in allCustomerKeys) {
            val cBills = customerBills[custId] ?: emptyList()
            val cPayments = customerPayments[custId] ?: emptyList()
            val contact = contactMap[custId] ?: contacts.find { it.name.equals(custId, ignoreCase = true) }
            val openingBalance = contact?.openingBalance ?: 0.0

            val sortedBills = cBills.sortedBy { parseDate(it.date)?.time ?: 0L }
            val sortedPayments = cPayments.sortedBy { parseDate(it.paymentDate)?.time ?: 0L }

            val pQueue = sortedPayments.map { p ->
                val amt = p.effectiveAmount
                PaymentQueueItem(p.id, amt, amt)
            }.toMutableList()

            var availableCredit = 0.0
            var debtToSettleFirst = 0.0

            if (openingBalance < 0) {
                availableCredit = abs(openingBalance)
            } else {
                debtToSettleFirst = openingBalance
            }

            while (debtToSettleFirst > 0.0 && pQueue.isNotEmpty()) {
                val p = pQueue[0]
                val consumed = Math.min(debtToSettleFirst, p.remaining)
                debtToSettleFirst -= consumed
                p.remaining -= consumed
                if (p.remaining <= 0.00001) pQueue.removeAt(0)
            }

            for (bill in sortedBills) {
                val billAmount = bill.grandTotal
                var remainingToSettle = billAmount

                if (availableCredit > 0.0) {
                    val consumed = Math.min(remainingToSettle, availableCredit)
                    remainingToSettle -= consumed
                    availableCredit -= consumed
                }

                while (remainingToSettle > 0.0 && pQueue.isNotEmpty()) {
                    val p = pQueue[0]
                    val consumed = Math.min(remainingToSettle, p.remaining)
                    remainingToSettle -= consumed
                    p.remaining -= consumed
                    if (p.remaining <= 0.00001) pQueue.removeAt(0)
                }

                billBalances[bill.id] = remainingToSettle
            }
        }

        return billBalances
    }

    /**
     * Get list of overdue bill reminders (>30 days old from invoice date)
     */
    fun getOverdueBills(
        bills: List<Bill>,
        payments: List<PaymentRecord>,
        contacts: List<Contact>,
        now: Date = Date()
    ): List<OverdueBillReminder> {
        val billBalances = calculateBillBalances(bills, payments, contacts)
        val overdueList = mutableListOf<OverdueBillReminder>()
        val displayDateFormat = SimpleDateFormat("dd/MM/yyyy", Locale.US)

        for (bill in bills) {
            val remaining = billBalances[bill.id] ?: 0.0
            if (remaining > 0.01) {
                val billDate = parseDate(bill.date)
                if (billDate != null) {
                    val diffMillis = now.time - billDate.time
                    val daysAgo = (diffMillis / (1000 * 60 * 60 * 24)).toInt()
                    
                    // Overdue if invoice age > 30 days
                    if (daysAgo > 30) {
                        val daysOverdue = daysAgo - 30
                        val isCritical = daysOverdue > 30 // > 60 days from invoice date
                        
                        overdueList.add(
                            OverdueBillReminder(
                                billId = bill.id,
                                referenceNo = bill.billNumber.ifEmpty { "INV-${bill.id}" },
                                customerName = bill.customerName,
                                invoiceDate = displayDateFormat.format(billDate),
                                remainingAmount = remaining,
                                daysOverdue = daysOverdue,
                                isCritical = isCritical
                            )
                        )
                    }
                }
            }
        }

        return overdueList.sortedByDescending { it.daysOverdue }
    }

    data class SettlementInfo(
        val isSettled: Boolean,
        val days: Int
    ) {
        val settled: Boolean get() = isSettled
    }

    /**
     * Calculate settlement map matching web's calculateSettlementMap.
     * Returns Map of billId -> SettlementInfo(isSettled, days)
     */
    fun calculateSettlementMap(
        bills: List<Bill>,
        payments: List<PaymentRecord>,
        openingBalance: Double = 0.0,
        now: Date = Date()
    ): Map<String, SettlementInfo> {
        val settlementMap = mutableMapOf<String, SettlementInfo>()
        if (bills.isEmpty()) return settlementMap

        val sortedBills = bills.sortedBy { parseDate(it.date)?.time ?: 0L }
        val sortedPayments = payments.sortedBy { parseDate(it.safePaymentDate)?.time ?: 0L }

        class PItem(var remaining: Double, val dateStr: String?)

        val pQueue = sortedPayments.map { p ->
            val amt = p.effectiveAmount
            PItem(amt, p.safePaymentDate)
        }.toMutableList()

        var availableCredit = 0.0
        var debtToSettleFirst = 0.0

        if (openingBalance < 0) {
            availableCredit = abs(openingBalance)
        } else {
            debtToSettleFirst = openingBalance
        }

        while (debtToSettleFirst > 0.0 && pQueue.isNotEmpty()) {
            val p = pQueue[0]
            val consumed = Math.min(debtToSettleFirst, p.remaining)
            debtToSettleFirst -= consumed
            p.remaining -= consumed
            if (p.remaining <= 0.00001) pQueue.removeAt(0)
        }

        for (bill in sortedBills) {
            val billAmount = bill.grandTotal
            var remainingToSettle = billAmount
            var lastCreditDateStr: String? = null

            if (availableCredit > 0.0) {
                val consumed = Math.min(remainingToSettle, availableCredit)
                remainingToSettle -= consumed
                availableCredit -= consumed
                if (remainingToSettle <= 0.00001) {
                    lastCreditDateStr = bill.date
                }
            }

            while (remainingToSettle > 0.0 && pQueue.isNotEmpty()) {
                val p = pQueue[0]
                val consumed = Math.min(remainingToSettle, p.remaining)
                remainingToSettle -= consumed
                p.remaining -= consumed
                if (p.remaining <= 0.00001) pQueue.removeAt(0)

                if (remainingToSettle <= 0.00001) {
                    lastCreditDateStr = p.dateStr
                }
            }

            val invoiceDate = parseDate(bill.date) ?: now
            if (remainingToSettle <= 0.00001 && lastCreditDateStr != null) {
                val settleDate = parseDate(lastCreditDateStr) ?: invoiceDate
                val diffTime = Math.max(0L, settleDate.time - invoiceDate.time)
                val diffDays = Math.ceil(diffTime.toDouble() / (1000 * 60 * 60 * 24)).toInt()
                settlementMap[bill.id] = SettlementInfo(isSettled = true, days = if (diffDays <= 0) 1 else diffDays)
            } else {
                val diffTime = Math.max(0L, now.time - invoiceDate.time)
                val diffDays = Math.ceil(diffTime.toDouble() / (1000 * 60 * 60 * 24)).toInt()
                settlementMap[bill.id] = SettlementInfo(isSettled = false, days = if (diffDays <= 0) 1 else diffDays)
            }
        }

        return settlementMap
    }
}

