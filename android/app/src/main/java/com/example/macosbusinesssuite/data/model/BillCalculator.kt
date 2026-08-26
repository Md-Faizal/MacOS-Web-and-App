package com.example.macosbusinesssuite.data.model

import kotlin.math.roundToInt

data class CalculatedLineItem(
    val productId: String = "",
    val variantId: String? = null,
    val batchId: String? = null,
    val rate: Double,
    val discountedRate: Double,
    val qty: Int,
    val amount: Double,
    val discount1Percent: Double,
    val discount1Amount: Double,
    val discount2Percent: Double,
    val discount2Amount: Double,
    val gstPercent: Double,
    val gstAmount: Double,
    val sgstAmount: Double,
    val cgstAmount: Double,
    val finalAmount: Double,
    val gstReverse: Boolean
)

data class BillSummary(
    val subtotal: Double,
    val totalAmount: Double,
    val totalDiscount: Double,
    val totalGst: Double,
    val totalSgst: Double,
    val totalCgst: Double,
    val roundOff: Double,
    val grandTotal: Double
)

object BillCalculator {
    fun calculateLineItem(
        productId: String = "",
        variantId: String? = null,
        batchId: String? = null,
        rateInput: Double,
        qtyInput: Int,
        disc1PercentInput: Double,
        disc2PercentInput: Double,
        sgstPercentInput: Double,
        cgstPercentInput: Double,
        gstTotalInput: Double,
        gstReverse: Boolean
    ): CalculatedLineItem {
        var rate = rateInput
        val qty = qtyInput
        val disc1Percent = disc1PercentInput
        val disc2Percent = disc2PercentInput
        val sgstPercent = sgstPercentInput
        val cgstPercent = cgstPercentInput
        
        val gstTotal = if (gstTotalInput > 0) gstTotalInput else (sgstPercent + cgstPercent)

        var baseRate = rate
        if (gstReverse) {
            baseRate = rate * (1 - 0.0477)
            rate = baseRate
        }

        val amount = rate * qty
        val discount1Amount = amount * (disc1Percent / 100)
        val amountAfterDisc1 = amount - discount1Amount
        val discountedRate = rate * (1 - disc1Percent / 100)

        val discount2Amount = amountAfterDisc1 * (disc2Percent / 100)
        val amountAfterDisc2 = amountAfterDisc1 - discount2Amount

        var gstAmount = 0.0
        var sgstAmount = 0.0
        var cgstAmount = 0.0

        if (gstTotal > 0) {
            gstAmount = amountAfterDisc2 * (gstTotal / 100)
            if (sgstPercent > 0 && cgstPercent > 0) {
                sgstAmount = amountAfterDisc2 * (sgstPercent / 100)
                cgstAmount = amountAfterDisc2 * (cgstPercent / 100)
            } else {
                sgstAmount = gstAmount / 2
                cgstAmount = gstAmount / 2
            }
        }

        val finalAmountUnrounded = amountAfterDisc2 + gstAmount

        return CalculatedLineItem(
            productId = productId,
            variantId = variantId,
            batchId = batchId,
            rate = Math.round(rate * 100.0) / 100.0,
            discountedRate = Math.round(discountedRate * 100.0) / 100.0,
            qty = qty,
            amount = Math.round(amount * 100.0) / 100.0,
            discount1Percent = disc1Percent,
            discount1Amount = Math.round(discount1Amount * 100.0) / 100.0,
            discount2Percent = disc2Percent,
            discount2Amount = Math.round(discount2Amount * 100.0) / 100.0,
            gstPercent = gstTotal,
            gstAmount = Math.round(gstAmount * 100.0) / 100.0,
            sgstAmount = Math.round(sgstAmount * 100.0) / 100.0,
            cgstAmount = Math.round(cgstAmount * 100.0) / 100.0,
            finalAmount = Math.round(finalAmountUnrounded * 100.0) / 100.0,
            gstReverse = gstReverse
        )
    }

    fun calculateBillSummary(items: List<CalculatedLineItem>): BillSummary {
        var totalAmount = 0.0
        var totalDiscount = 0.0
        var totalGst = 0.0
        var totalSgst = 0.0
        var totalCgst = 0.0

        items.forEach { item ->
            totalAmount += item.amount
            totalDiscount += item.discount1Amount
            totalDiscount += item.discount2Amount
            totalGst += item.gstAmount
            totalSgst += item.sgstAmount
            totalCgst += item.cgstAmount
        }

        val subtotalUnrounded = totalAmount - totalDiscount + totalGst
        val grandTotal = subtotalUnrounded.roundToInt().toDouble()
        val roundOff = Math.round((grandTotal - subtotalUnrounded) * 100.0) / 100.0

        return BillSummary(
            subtotal = Math.round(subtotalUnrounded * 100.0) / 100.0,
            totalAmount = Math.round(totalAmount * 100.0) / 100.0,
            totalDiscount = Math.round(totalDiscount * 100.0) / 100.0,
            totalGst = Math.round(totalGst * 100.0) / 100.0,
            totalSgst = Math.round(totalSgst * 100.0) / 100.0,
            totalCgst = Math.round(totalCgst * 100.0) / 100.0,
            roundOff = roundOff,
            grandTotal = grandTotal
        )
    }

    fun calculateFreeItems(qty: Int, scheme: String?): Int {
        if (scheme.isNullOrEmpty()) return 0
        val parts = scheme.split("+")
        if (parts.size != 2) return 0

        val itemsRequired = parts[0].toIntOrNull() ?: 0
        val freeItems = parts[1].toIntOrNull() ?: 0

        if (itemsRequired == 0) return 0
        val completeSets = qty / itemsRequired
        return completeSets * freeItems
    }
}
