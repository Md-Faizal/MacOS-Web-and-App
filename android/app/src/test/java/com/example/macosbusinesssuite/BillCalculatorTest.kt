package com.example.macosbusinesssuite

import com.example.macosbusinesssuite.data.model.CalculateBillItemRequest
import com.example.macosbusinesssuite.domain.calculation.BillCalculator
import org.junit.Assert.assertEquals
import org.junit.Test

class BillCalculatorTest {

    @Test
    fun testLineItemAndSummaryParityWithBackend() {
        val item1 = CalculateBillItemRequest(
            productName = "Product A",
            rate = 1000.0,
            qty = 2.0,
            disc1 = 10.0,
            disc2 = 5.0,
            gstPercent = 18.0,
            gstReverse = false
        )

        val calcItem1 = BillCalculator.calculateLineItem(item1, 0)
        assertEquals(2000.0, calcItem1.amount, 0.01)
        assertEquals(200.0, calcItem1.discount1Amount, 0.01)
        assertEquals(90.0, calcItem1.discount2Amount, 0.01)
        assertEquals(307.80, calcItem1.gstAmount, 0.01)
        assertEquals(153.90, calcItem1.sgstAmount, 0.01)
        assertEquals(153.90, calcItem1.cgstAmount, 0.01)
        assertEquals(2017.80, calcItem1.finalAmount, 0.01)

        val item2 = CalculateBillItemRequest(
            productName = "Product B",
            rate = 100.0,
            qty = 10.0,
            disc1 = 0.0,
            disc2 = 0.0,
            gstPercent = 5.0,
            gstReverse = true
        )

        val calcItem2 = BillCalculator.calculateLineItem(item2, 1)
        assertEquals(95.23, calcItem2.rate, 0.01)
        assertEquals(952.30, calcItem2.amount, 0.01)
        assertEquals(47.62, calcItem2.gstAmount, 0.01)
        assertEquals(23.81, calcItem2.sgstAmount, 0.01)
        assertEquals(23.81, calcItem2.cgstAmount, 0.01)
        assertEquals(999.92, calcItem2.finalAmount, 0.01)

        val response = BillCalculator.calculate(listOf(item1, item2))
        val summary = response.summary

        assertEquals(2952.30, summary.totalAmount, 0.01)
        assertEquals(290.0, summary.totalDiscount, 0.01)
        assertEquals(355.42, summary.totalGst, 0.01)
        assertEquals(3017.72, summary.subtotal, 0.01)
        assertEquals(0.28, summary.roundOff, 0.01)
        assertEquals(3018.0, summary.grandTotal, 0.01)
    }

    @Test
    fun testSchemeBonusCalculation() {
        assertEquals(0, BillCalculator.calculateFreeItems(4.0, "5+1"))
        assertEquals(1, BillCalculator.calculateFreeItems(5.0, "5+1"))
        assertEquals(1, BillCalculator.calculateFreeItems(9.0, "5+1"))
        assertEquals(2, BillCalculator.calculateFreeItems(10.0, "5+1"))
        assertEquals(2, BillCalculator.calculateFreeItems(11.0, "5+1"))
        assertEquals(3, BillCalculator.calculateFreeItems(15.0, "5+1"))
        assertEquals(4, BillCalculator.calculateFreeItems(20.0, "10+2"))
    }
}
