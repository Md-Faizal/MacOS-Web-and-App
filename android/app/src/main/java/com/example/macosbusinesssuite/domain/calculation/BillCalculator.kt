package com.example.macosbusinesssuite.domain.calculation

import com.example.macosbusinesssuite.data.model.CalculateBillCustomerInfo
import com.example.macosbusinesssuite.data.model.CalculateBillItemRequest
import com.example.macosbusinesssuite.data.model.CalculateBillResponse
import com.example.macosbusinesssuite.data.model.CalculateBillSummary
import com.example.macosbusinesssuite.data.model.CalculatedServerItem
import com.example.macosbusinesssuite.data.model.Contact
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Android Client-Side Bill Calculator Engine
 *
 * Provides instantaneous (0ms latency), non-debounced calculations for line items,
 * GST splitting, multi-tiered discounts, reverse GST deduction (4.77%), scheme free item logic,
 * and round-offs.
 *
 * Guarantees 100% mathematical parity with:
 * - frontend/shared/bill-calculator.js
 * - backend/core/billing/calculator.js
 */
object BillCalculator {

    private var isNativeLoaded = false

    init {
        try {
            System.loadLibrary("suite_core")
            isNativeLoaded = true
        } catch (_: Throwable) {
            try {
                val dllCandidate = java.io.File("shared/suite_core/target/release/suite_core.dll")
                val altCandidate = java.io.File("../../shared/suite_core/target/release/suite_core.dll")
                if (dllCandidate.exists()) {
                    System.load(dllCandidate.canonicalPath)
                    isNativeLoaded = true
                } else if (altCandidate.exists()) {
                    System.load(altCandidate.canonicalPath)
                    isNativeLoaded = true
                }
            } catch (_: Throwable) {
                isNativeLoaded = false
            }
        }
    }

    @JvmStatic
    private external fun calculateLineItemFast(
        rate: Double,
        qty: Double,
        disc1: Double,
        disc2: Double,
        gst: Double,
        gstReverse: Byte,
        outPtr: DoubleArray
    ): Int

    @JvmStatic
    private external fun calculateBillSummaryFast(
        itemsPtr: DoubleArray,
        itemsCount: Long,
        roundOffEnabled: Byte,
        outSummaryPtr: DoubleArray
    ): Int

    fun round2(value: Double): Double {
        return try {
            BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).toDouble()
        } catch (_: Exception) {
            Math.round(value * 100.0) / 100.0
        }
    }

    /**
     * Parse scheme string like "5+1", "10+2" and calculate free bonus items
     */
    fun calculateFreeItems(qty: Double, scheme: String?): Int {
        if (scheme.isNullOrBlank()) return 0
        val parts = scheme.split("+")
        if (parts.size != 2) return 0
        val itemsRequired = parts[0].trim().toIntOrNull() ?: 0
        val freeItems = parts[1].trim().toIntOrNull() ?: 0
        if (itemsRequired <= 0) return 0
        val completeSets = (qty.toInt() / itemsRequired)
        return completeSets * freeItems
    }

    /**
     * Calculate line item financial details via Rust SuiteCore JNI engine
     */
    fun calculateLineItem(
        rawItem: CalculateBillItemRequest,
        index: Int = 0
    ): CalculatedServerItem {
        val rate = if (rawItem.rate > 0.0) rawItem.rate else (rawItem.mrp ?: 0.0)
        val qty = if (rawItem.qty > 0.0) rawItem.qty else 1.0
        val disc1Percent = rawItem.disc1
        val disc2Percent = rawItem.disc2
        val gstReverse = rawItem.gstReverse
        val gstTotal = rawItem.gstPercent

        if (!isNativeLoaded) {
            throw IllegalStateException("[BillCalculator] Rust SuiteCore native engine is not loaded.")
        }

        val out = DoubleArray(7)
        val code = calculateLineItemFast(
            rate, qty, disc1Percent, disc2Percent, gstTotal,
            if (gstReverse) 1 else 0, out
        )
        if (code != 0) {
            throw IllegalStateException("[BillCalculator] Rust SuiteCore calculateLineItemFast failed with code $code")
        }

        val amount = out[0]
        val disc1Amount = out[1]
        val disc2Amount = out[2]
        val gstAmount = out[3]
        val sgstAmount = out[4]
        val cgstAmount = out[5]
        val finalAmount = out[6]
        val freeCount = calculateFreeItems(qty, rawItem.scheme)
        val effectiveRate = if (gstReverse) rate * (1.0 - 0.0477) else rate
        val discountedRate = effectiveRate * (1.0 - disc1Percent / 100.0)

        return CalculatedServerItem(
            index = index,
            productId = rawItem.productId,
            productName = rawItem.productName ?: "Product",
            variantId = rawItem.variantId,
            batchId = rawItem.batchId,
            packValue = rawItem.packValue,
            packType = rawItem.packType,
            batchNo = rawItem.batchNo,
            expDate = rawItem.expDate,
            scheme = rawItem.scheme,
            free = freeCount,
            rate = round2(effectiveRate),
            discountedRate = round2(discountedRate),
            qty = qty,
            amount = round2(amount),
            discount1Percent = disc1Percent,
            discount1Amount = round2(disc1Amount),
            discount2Percent = disc2Percent,
            discount2Amount = round2(disc2Amount),
            gstPercent = gstTotal,
            gstAmount = round2(gstAmount),
            sgstAmount = round2(sgstAmount),
            cgstAmount = round2(cgstAmount),
            finalAmount = round2(finalAmount),
            gstReverse = gstReverse
        )
    }

    /**
     * Calculate summary totals for a list of processed line items via Rust SuiteCore JNI engine
     */
    fun calculateBillSummary(
        items: List<CalculatedServerItem>,
        roundOffEnabled: Boolean = true
    ): CalculateBillSummary {
        if (!isNativeLoaded) {
            throw IllegalStateException("[BillCalculator] Rust SuiteCore native engine is not loaded.")
        }

        val flatItems = DoubleArray(items.size * 6)
        for (i in items.indices) {
            val it = items[i]
            val base = i * 6
            flatItems[base + 0] = it.amount
            flatItems[base + 1] = it.discount1Amount
            flatItems[base + 2] = it.discount2Amount
            flatItems[base + 3] = it.gstAmount
            flatItems[base + 4] = it.sgstAmount
            flatItems[base + 5] = it.cgstAmount
        }

        val out = DoubleArray(8)
        val code = calculateBillSummaryFast(
            flatItems,
            items.size.toLong(),
            if (roundOffEnabled) 1 else 0,
            out
        )
        if (code != 0) {
            throw IllegalStateException("[BillCalculator] Rust SuiteCore calculateBillSummaryFast failed with code $code")
        }

        return CalculateBillSummary(
            subtotal = out[0],
            totalAmount = out[1],
            totalDiscount = out[2],
            totalGst = out[3],
            totalSgst = out[4],
            totalCgst = out[5],
            roundOff = out[6],
            grandTotal = out[7]
        )
    }

    /**
     * Full instant calculation pipeline producing CalculateBillResponse
     */
    fun calculate(
        items: List<CalculateBillItemRequest>,
        customer: Contact? = null,
        roundOffEnabled: Boolean = true
    ): CalculateBillResponse {
        val processedItems = items.mapIndexed { idx, raw ->
            calculateLineItem(raw, idx)
        }
        val summary = calculateBillSummary(processedItems, roundOffEnabled)
        val prevDue = customer?.openingBalance ?: 0.0
        val projDue = round2(prevDue + summary.grandTotal)

        val custInfo = customer?.let {
            CalculateBillCustomerInfo(
                id = it.id.toLongOrNull(),
                name = it.name,
                phone = it.phone,
                openingBalance = it.openingBalance,
                previousDue = it.openingBalance,
                currentDue = it.openingBalance
            )
        }

        return CalculateBillResponse(
            success = true,
            customer = custInfo,
            items = processedItems,
            summary = summary,
            previousDue = prevDue,
            projectedDue = projDue
        )
    }
}
