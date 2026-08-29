package com.example.macosbusinesssuite.data.model

import com.google.gson.annotations.SerializedName

// ==================== AUTH & SERVER ====================
data class AuthStatusResponse(
    val success: Boolean? = true,
    val authenticated: Boolean = false,
    val user: UserProfile? = null,
    val passwordSet: Boolean = false,
    val hasSecurityQuestion: Boolean = false,
    val message: String? = null
)

data class LoginRequest(
    val identifier: String,
    val password: String,
    val deviceName: String? = null,
    val deviceType: String? = null
)

data class LoginResponse(
    val success: Boolean = false,
    val message: String? = null,
    val user: UserProfile? = null,
    val token: String? = null,
    val refreshToken: String? = null,
    val expiresIn: Long? = null
)

data class MobileRefreshRequest(
    val refreshToken: String
)

data class UserProfile(
    val id: String? = null,
    val username: String? = null,
    val email: String? = null,
    val role: String? = null,
    val avatar: String? = null,
    val deviceId: String? = null
)

// Profile API responses
data class ProfileData(
    val id: String? = null,
    val username: String? = null,
    @SerializedName("full_name") val fullName: String? = null,
    @SerializedName("email_id") val emailId: String? = null,
    @SerializedName("profile_picture") val profilePicture: String? = null,
    @SerializedName("google_id") val googleId: String? = null,
    @SerializedName("google_email") val googleEmail: String? = null,
    @SerializedName("google_name") val googleName: String? = null,
    @SerializedName("google_picture") val googlePicture: String? = null,
    @SerializedName("name_source") val nameSource: String? = "local",
    @SerializedName("picture_source") val pictureSource: String? = "local"
)

data class ProfileResponse(
    val success: Boolean = true,
    val profile: ProfileData? = null
)

data class UpdateProfileRequest(
    val full_name: String? = null,
    val email_id: String? = null,
    val username: String? = null,
    val profile_picture: String? = null
)

// Active Devices API
data class DeviceItem(
    val id: String = "",
    val name: String = "Unknown Device",
    val ip: String? = null,
    val os: String? = null,
    @SerializedName("last_active") val lastActive: String? = null,
    @SerializedName("is_current") val isCurrent: Boolean = false
)

data class DevicesResponse(
    val success: Boolean = true,
    val devices: List<DeviceItem> = emptyList()
)

data class SecurityQuestion(
    val id: Int = 0,
    val question: String = ""
)

data class UpdateSecurityRequest(
    val currentPassword: String? = null,
    val newPassword: String? = null,
    val questionId: Int? = null,
    val answer: String? = null
)

// ==================== PRODUCTS ====================
data class Product(
    val id: String = "",
    val name: String = "",
    @SerializedName("category_id") val categoryId: String? = null,
    @SerializedName("category_name") val categoryName: String? = null,
    val category: String = categoryName ?: "General",
    val classification: String = "Non-Gold",
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null,
    val variants: List<ProductVariant> = emptyList(),
    val batches: List<ProductBatch> = emptyList(),
    // Flat properties appended by backend handlers.js for convenience
    val pack: String? = null,
    @SerializedName("batch_no") val defaultBatchNo: String? = null,
    val mrp: Double? = null
) {
    val idString: String
        get() = id

    // Compatibility for BillingScreen which expects a flat 'price'
    val price: Double
        get() = mrp ?: variants.firstOrNull()?.batches?.firstOrNull()?.mrp ?: 0.0

    fun getTotalUnitsSold(): Int {
        return variants.sumOf { variant ->
            variant.batches.sumOf { it.unitsSold }
        }
    }
}

data class Category(
    val id: String = "",
    val name: String = "",
    val description: String? = null,
    @SerializedName("item_count") val itemCount: Int = 0,
    @SerializedName("created_at") val createdAt: String? = null
) {
    val idString: String
        get() = id
}

fun naturalCompareBatchNo(s1: String, s2: String): Int {
    val regex = Regex("(\\d+)|(\\D+)")
    val match1 = regex.findAll(s1).map { it.value }.toList()
    val match2 = regex.findAll(s2).map { it.value }.toList()
    val len = minOf(match1.size, match2.size)
    for (i in 0 until len) {
        val part1 = match1[i]
        val part2 = match2[i]
        val num1 = part1.toLongOrNull()
        val num2 = part2.toLongOrNull()
        val cmp = if (num1 != null && num2 != null) {
            num1.compareTo(num2)
        } else {
            part1.compareTo(part2, ignoreCase = true)
        }
        if (cmp != 0) return cmp
    }
    return match1.size.compareTo(match2.size)
}

data class ProductVariant(
    val id: String = "",
    @SerializedName("product_id") val productId: String = "",
    @SerializedName("pack_size_value") val packSizeValue: Any? = null,
    @SerializedName("pack_size_type") val packSizeType: String? = null,
    val batches: List<ProductBatch> = emptyList()
) {
    val idString: String
        get() = id

    val sortedBatches: List<ProductBatch>
        get() = batches.sortedWith(Comparator { a, b ->
            naturalCompareBatchNo(a.effectiveBatchNo, b.effectiveBatchNo)
        })

    val packSize: String
        get() {
            val valNum = when (val p = packSizeValue) {
                is Number -> p.toDouble()
                is String -> p.toDoubleOrNull()
                else -> null
            }
            val valStr = valNum?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: ""
            val typeStr = packSizeType ?: ""
            val res = (valStr + typeStr).trim()
            return if (res.isNotEmpty()) res else "Standard"
        }
}

data class ProductBatch(
    val id: String = "",
    @SerializedName("variant_id") val variantId: String = "",
    @SerializedName("batch_no") val batchNo: String = "",
    val mrp: Double = 0.0,
    @SerializedName("mfg_date") val mfgDate: String? = null,
    @SerializedName("exp_date") val expDate: String? = null,
    @SerializedName("units_sold") val unitsSold: Int = 0
) {
    val idString: String
        get() = id

    val effectiveBatchNo: String
        get() = batchNo.ifEmpty { "DEFAULT" }
}

data class UpdateMRPRequest(
    @SerializedName("product_id") val productId: String,
    @SerializedName("variant_id") val variantId: String? = null,
    @SerializedName("batch_no") val batchNo: String? = null,
    val mrp: Double
)

// ==================== CONTACTS (FULL BACKEND SCHEMAS) ====================
data class Contact(
    val id: String = "",
    val name: String = "",
    val email: String? = null,
    val phone: String? = null,
    val address: String? = null,
    val gstin: String? = null,
    @SerializedName("licence_no") val licenceNo: String? = null,
    val pan: String? = null,
    @SerializedName("total_sales") val totalSales: Double = 0.0,
    @SerializedName("avg_sales") val avgSales: Double = 0.0,
    @SerializedName("real_total_sales") val realTotalSales: Double = 0.0,
    @SerializedName("real_avg_sales") val realAvgSales: Double = 0.0,
    @SerializedName("current_due") val currentDue: Double = 0.0,
    @SerializedName("last_bill_date") val lastBillDate: String? = null,
    @SerializedName("last_payment_date") val lastPaymentDate: String? = null,
    @SerializedName("favorite_product") val favoriteProduct: String? = null,
    @SerializedName("favorite_product_id") val favoriteProductId: Any? = null,
    @SerializedName("reference_no") val referenceNo: String? = null,
    @SerializedName("opening_balance") val openingBalance: Double = 0.0,
    @SerializedName("exclude_from_stats") val excludeFromStats: Int = 0,
    val notes: String? = null,
    @SerializedName("transport_preference") val transportPreference: String? = null,
    val type: String? = "Customer",
    val active: String? = "ACTIVE",
    val status: String? = null,
    @SerializedName("last_activity") val lastActivity: String? = null,
    @SerializedName("disable_duplex_export") val disableDuplexExport: Int = 0,
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("updated_at") val updatedAt: String? = null
)

data class ActivityStatus(
    val customerId: String = "",
    val status: String = "Active", // Active, Churned, At-Risk
    val totalOrders: Int = 0,
    val totalSpent: Double = 0.0,
    val daysSinceLastOrder: Int = 0
)

// ==================== BILLING ====================
data class BillItem(
    val id: String = "",
    @SerializedName("product_id") val productId: String = "",
    @SerializedName("product_name", alternate = ["name"]) val productName: String = "",
    @SerializedName("variant_id") val variantId: String? = null,
    @SerializedName("batch_id") val batchId: String? = null,
    @SerializedName("batch_no") val batchNo: String? = null,
    @SerializedName("qty", alternate = ["quantity"]) val quantity: Double = 1.0,
    @SerializedName("rate", alternate = ["price"]) val rate: Double = 0.0,
    @SerializedName("amount", alternate = ["total"]) val amount: Double = 0.0,
    @SerializedName("discount_1_percent") val discount1Percent: Double = 0.0,
    @SerializedName("discount_1_amount") val discount1Amount: Double = 0.0,
    @SerializedName("discount_2_percent") val discount2Percent: Double = 0.0,
    @SerializedName("discount_2_amount") val discount2Amount: Double = 0.0,
    @SerializedName("gst_percent") val gstPercent: Double = 0.0,
    @SerializedName("gst_amount") val gstAmount: Double = 0.0,
    @SerializedName("final_amount") val finalAmount: Double = 0.0,
    val unit: String = "pcs"
)

data class Bill(
    val id: String = "",
    @SerializedName("reference_no", alternate = ["invoice_no", "bill_number", "billNumber"]) val billNumber: String = "",
    @SerializedName("bill_date", alternate = ["invoice_date", "created_at", "date"]) val date: String = "",
    @SerializedName("customer_id") val customerId: String? = null,
    @SerializedName("customer_name", alternate = ["customer"]) val customerName: String = "Walk-in Customer",
    @SerializedName("customer_phone") val customerPhone: String? = null,
    val items: List<BillItem> = emptyList(),
    val subtotal: Double = 0.0,
    @SerializedName("total_discount", alternate = ["discount", "discountTotal"]) val discountTotal: Double = 0.0,
    @SerializedName("total_gst", alternate = ["tax", "taxTotal"]) val taxTotal: Double = 0.0,
    @SerializedName("round_off") val roundOff: Double = 0.0,
    @SerializedName("grand_total", alternate = ["total", "total_amount", "grandTotal"]) val grandTotal: Double = 0.0,
    @SerializedName("paid_amount", alternate = ["paidAmount"]) val paidAmount: Double = 0.0,
    @SerializedName("balance_amount", alternate = ["balanceAmount"]) val balanceAmount: Double = 0.0,
    @SerializedName("due_date") val dueDate: String? = null,
    val status: String = "Paid",
    @SerializedName("payment_mode", alternate = ["paymentMode"]) val paymentMode: String = "Cash",
    val notes: String? = null
)

data class CreateBillRequest(
    @SerializedName("customer_id") val customerId: String? = null,
    @SerializedName("customer_name") val customerName: String,
    @SerializedName("customer_phone") val customerPhone: String? = null,
    @SerializedName("products") val items: List<BillItem>,
    @SerializedName("subtotal") val subtotal: Double,
    @SerializedName("total_discount") val discountTotal: Double,
    @SerializedName("total_gst") val taxTotal: Double,
    @SerializedName("round_off") val roundOff: Double = 0.0,
    @SerializedName("grand_total") val grandTotal: Double,
    @SerializedName("paid_amount") val paidAmount: Double,
    @SerializedName("payment_mode") val paymentMode: String = "Cash",
    @SerializedName("invoice_date") val invoiceDate: String? = null,
    @SerializedName("due_date") val dueDate: String? = null,
    @SerializedName("notes") val notes: String? = null
)

data class UpdateBillRequest(
    @SerializedName("due_date") val dueDate: String? = null,
    @SerializedName("total_discount") val totalDiscount: Double? = null,
    @SerializedName("total_gst") val totalGst: Double? = null,
    @SerializedName("round_off") val roundOff: Double? = null,
    @SerializedName("grand_total") val grandTotal: Double? = null,
    @SerializedName("invoice_date") val invoiceDate: String? = null,
    @SerializedName("products") val products: List<BillItem>? = null
)

data class CustomerPreference(
    val customerName: String,
    val productName: String,
    val lastPrice: Double = 0.0,
    val preferredQuantity: Double = 1.0,
    val discountPercentage: Double = 0.0
)

data class BillingSummary(
    @SerializedName("total_sales", alternate = ["total_amount"]) val totalSales: Double = 0.0,
    @SerializedName("total_bills", alternate = ["total_invoices"]) val totalBills: Int = 0,
    @SerializedName("total_paid") val totalPaid: Double = 0.0,
    @SerializedName("total_pending") val totalPending: Double = 0.0,
    @SerializedName("today_sales") val todaySales: Double = 0.0
)

data class TotalCollectedResponse(
    @SerializedName("total_payments") val totalPayments: Double = 0.0,
    @SerializedName("total_credits") val totalCredits: Double = 0.0,
    @SerializedName("total_collected") val totalCollected: Double = 0.0
)

data class RecordPaymentRequest(
    @SerializedName("invoice_id") val invoiceId: String? = null,
    @SerializedName("customer_id") val customerId: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("payment_medium") val paymentMedium: String? = "cash",
    @SerializedName("reference_number") val referenceNumber: String? = null,
    @SerializedName("payment_date") val paymentDate: String? = null,
    @SerializedName("notes") val notes: String? = null
)

data class RecordCreditNoteRequest(
    @SerializedName("invoice_id") val invoiceId: String? = null,
    @SerializedName("customer_id") val customerId: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("reason") val reason: String,
    @SerializedName("payment_date") val paymentDate: String? = null,
    @SerializedName("reference_number") val referenceNumber: String? = null,
    @SerializedName("notes") val notes: String? = null,
    @SerializedName("attachment_data") val attachmentData: String? = null
)

data class CustomerOutstandingResponse(
    @SerializedName("customer_id") val customerId: String? = null,
    @SerializedName("total_outstanding") val totalOutstanding: Double = 0.0,
    @SerializedName("opening_balance") val openingBalance: Double = 0.0,
    @SerializedName("total_invoiced") val totalInvoiced: Double = 0.0,
    @SerializedName("outstanding_bills_count") val outstandingBillsCount: Int = 0,
    @SerializedName("total_bills") val totalBills: Int = 0
)

data class NextReferenceResponse(
    @SerializedName("reference_number") val referenceNumber: String = ""
)

data class LedgerCustomer(
    val customerId: String = "",
    val customerName: String = "",
    val phone: String? = null,
    val balance: Double = 0.0,
    val status: String = "Clear",
    @SerializedName("exclude_from_stats", alternate = ["exclude_stats", "excludeFromStats"]) val excludeFromStats: Boolean = false,
    @SerializedName("active", alternate = ["active_state", "status_active"]) val activeState: String = "ACTIVE",
    @SerializedName("last_bill_date", alternate = ["lastBillDate", "last_bill"]) val lastBillDate: String? = null,
    @SerializedName("last_payment_date", alternate = ["lastPaymentDate", "last_payment"]) val lastPaymentDate: String? = null,
    @SerializedName("days_overdue", alternate = ["daysOverdue", "overdue_days"]) val daysOverdue: Int = 0
)

data class PaymentRecord(
    val id: String = "",
    @SerializedName("customer_id") val customerId: String? = null,
    @SerializedName("customer_name", alternate = ["customer"]) val customerName: String = "",
    @SerializedName("amount", alternate = ["paid_amount", "amount_paid", "payment_amount"]) val amount: Double = 0.0,
    @SerializedName("credit_amount") val creditAmount: Double = 0.0,
    val type: String = "PAYMENT", // PAYMENT or CREDIT_NOTE
    @SerializedName("payment_mode", alternate = ["paymentMode"]) val paymentMode: String = "Cash",
    @SerializedName("payment_medium", alternate = ["paymentMedium", "method"]) val paymentMedium: String = "Cash",
    @SerializedName("reference_no", alternate = ["reference_number", "referenceNo"]) val referenceNo: String? = null,
    @SerializedName("payment_date", alternate = ["created_at", "paymentDate"]) val paymentDate: String = "",
    @SerializedName("created_at") val createdAt: String? = null,
    @SerializedName("attachment_data", alternate = ["attachmentData", "attachment"]) val attachmentData: String? = null
) {
    val safeCustomerName: String
        get() = (customerName as String?).takeIf { !it.isNullOrBlank() } ?: "Customer"

    val safeType: String
        get() = (type as String?).takeIf { !it.isNullOrBlank() } ?: "PAYMENT"

    val safePaymentDate: String
        get() = (paymentDate as String?).takeIf { !it.isNullOrBlank() } ?: createdAt ?: ""

    val safePaymentMedium: String
        get() = (paymentMedium as String?).takeIf { !it.isNullOrBlank() } ?: (paymentMode as String?).takeIf { !it.isNullOrBlank() } ?: "Cash"

    val effectiveAmount: Double
        get() {
            val t = safeType
            if (t.equals("CREDIT_NOTE", ignoreCase = true) || t.contains("CREDIT", true) || t.contains("CN", true)) {
                return if (creditAmount > 0.0) creditAmount else amount
            }
            return if (amount > 0.0) amount else creditAmount
        }
}

data class OrderItemRecord(
    val id: String = "",
    @SerializedName("order_id") val orderId: String = "",
    @SerializedName("product_id") val productId: String = "",
    @SerializedName("product_name", alternate = ["name"]) val productName: String = "",
    @SerializedName("variant_id") val variantId: String? = null,
    @SerializedName("batch_id") val batchId: String? = null,
    @SerializedName("ordered_qty", alternate = ["quantity", "qty"]) val orderedQty: Double = 0.0,
    @SerializedName("received_qty", alternate = ["delivered_qty", "rec_qty"]) val receivedQty: Double = 0.0,
    @SerializedName("not_received_qty", alternate = ["not_rec_qty"]) val notReceivedQty: Double = 0.0,
    @SerializedName("rate", alternate = ["price", "mrp"]) val rate: Double = 0.0,
    @SerializedName("amount", alternate = ["total"]) val amount: Double = 0.0
)

data class OrderRecord(
    val id: String = "",
    @SerializedName("order_number", alternate = ["bill_reference", "orderNumber"]) val orderNumber: String = "",
    @SerializedName("customer_id") val customerId: String? = null,
    @SerializedName("customer_name", alternate = ["customer"]) val customerName: String = "",
    @SerializedName("current_stage") val currentStage: String = "stage1",
    val status: String = "pending",
    @SerializedName("total_amount", alternate = ["total", "totalAmount"]) val totalAmount: Double = 0.0,
    @SerializedName("order_date", alternate = ["created_at", "orderDate"]) val orderDate: String = "",
    @SerializedName("delivery_date") val deliveryDate: String? = null,
    @SerializedName("order_notes") val orderNotes: String = "",
    val items: List<OrderItemRecord> = emptyList()
)

data class CreateOrderRequest(
    @SerializedName("customer_id") val customerId: String,
    @SerializedName("order_number") val orderNumber: String? = null,
    @SerializedName("current_stage") val currentStage: String = "stage1",
    @SerializedName("order_date") val orderDate: String? = null,
    @SerializedName("order_notes") val orderNotes: String = "",
    @SerializedName("total_amount") val totalAmount: Double,
    @SerializedName("status") val status: String = "pending",
    @SerializedName("items") val items: List<OrderItemRequest>
)

data class OrderItemRequest(
    @SerializedName("product_id") val productId: String,
    @SerializedName("variant_id") val variantId: String? = null,
    @SerializedName("batch_id") val batchId: String? = null,
    @SerializedName("qty") val qty: Double,
    @SerializedName("rate") val rate: Double,
    @SerializedName("amount") val amount: Double
)

data class DetailedLedgerData(
    val customer: Contact,
    val bank: BankDetails,
    val stats: LedgerStats,
    val bills: List<Bill>,
    val payments: List<PaymentRecord>
)

data class DetailedLedgerResponse(
    val success: Boolean = true,
    val data: DetailedLedgerData? = null
)

data class BankDetails(
    @SerializedName("upi_id") val upiId: String = "",
    @SerializedName("account_holder") val accountHolder: String = "",
    @SerializedName("account_number") val accountNumber: String = "",
    @SerializedName("ifsc") val ifsc: String = "",
    @SerializedName("branch") val branch: String = "",
    @SerializedName("account_type") val accountType: String = ""
)

data class LedgerStats(
    @SerializedName("total_bills") val totalBills: Int = 0,
    @SerializedName("total_payments") val totalPayments: Int = 0,
    @SerializedName("total_billed") val totalBilled: Double = 0.0,
    @SerializedName("total_collected") val totalCollected: Double = 0.0
)

// ==================== ANALYTICS ====================
data class AnalyticsSummary(
    val totalRevenue: Double = 0.0,
    val totalOrders: Int = 0,
    val averageOrderValue: Double = 0.0,
    val totalCustomers: Int = 0,
    val netProfit: Double = 0.0,
    val growthRate: Double = 0.0
)

data class ExecutiveKPI(
    @SerializedName("total_billed") val totalBilled: Double = 0.0,
    @SerializedName("total_collected") val totalCollected: Double = 0.0,
    @SerializedName("total_credit_notes") val totalCreditNotes: Double = 0.0,
    @SerializedName("total_receivables") val totalReceivables: Double = 0.0,
    @SerializedName("total_invoices") val totalInvoices: Int = 0,
    @SerializedName("total_gst") val totalGst: Double = 0.0,
    @SerializedName("total_discount") val totalDiscount: Double = 0.0,
    @SerializedName("total_customers") val totalCustomers: Int = 0,
    @SerializedName("collection_rate_percent") val collectionRatePercent: Double = 0.0,
    
    // Fallback aliases for legacy views
    val revenue: Double = 0.0,
    val ordersCount: Int = 0,
    val activeCustomers: Int = 0,
    val receivables: Double = 0.0
)

// App logging payload from mobile clients
data class AppLogRequest(
    @SerializedName("session_id") val sessionId: String? = null,
    @SerializedName("device_id") val deviceId: String? = null,
    @SerializedName("user_id") val userId: String? = null,
    @SerializedName("user_name") val userName: String? = null,
    val level: String = "INFO",
    val message: String = "",
    val stack: String? = null,
    val metadata: Map<String, String>? = null,
    val timestamp: String? = null
)

data class SalesTrendPoint(
    val date: String = "",
    val amount: Double = 0.0,
    val orders: Int = 0
)

data class TopProductItem(
    val productId: String = "",
    val name: String = "",
    @SerializedName("pack_size_value") val packSizeValue: Any? = null,
    @SerializedName("pack_size_type") val packSizeType: String? = null,
    @SerializedName("total_qty") val totalQty: Double = 0.0,
    @SerializedName("total_sold") val totalSold: Int = 0,
    @SerializedName("total_revenue") val totalRevenue: Double = 0.0
)

data class TopCustomerItem(
    val customerId: String = "",
    val id: String = "",
    val name: String = "",
    @SerializedName("order_count") val orderCount: Int = 0,
    @SerializedName("ordersCount") val ordersCount: Int = 0,
    @SerializedName("total_spent") val totalSpent: Double = 0.0
)

// --- Sales Deep Dive ---
data class SalesPeriodItem(
    val period: String = "",
    @SerializedName("gross_revenue") val grossRevenue: Double = 0.0,
    @SerializedName("taxable_amount") val taxableAmount: Double = 0.0,
    @SerializedName("gst_collected") val gstCollected: Double = 0.0,
    @SerializedName("discount_given") val discountGiven: Double = 0.0,
    @SerializedName("invoice_count") val invoiceCount: Int = 0
)

data class TaxSummary(
    @SerializedName("total_sgst") val totalSgst: Double = 0.0,
    @SerializedName("total_cgst") val totalCgst: Double = 0.0,
    @SerializedName("line_item_discounts") val lineItemDiscounts: Double = 0.0
)

data class SalesDeepDiveResponse(
    @SerializedName("time_series") val timeSeries: List<SalesPeriodItem> = emptyList(),
    @SerializedName("tax_summary") val taxSummary: TaxSummary? = null
)

// --- Order Funnel ---
data class OrderStageItem(
    @SerializedName("current_stage") val currentStage: String = "",
    @SerializedName("order_count") val orderCount: Int = 0,
    @SerializedName("total_value") val totalValue: Double = 0.0
)

data class OrderStatusItem(
    val status: String = "",
    @SerializedName("order_count") val orderCount: Int = 0,
    @SerializedName("total_value") val totalValue: Double = 0.0
)

data class PendingOrderItem(
    val id: String = "",
    @SerializedName("order_number") val orderNumber: String = "",
    @SerializedName("customer_name") val customerName: String = "",
    @SerializedName("current_stage") val currentStage: String = "",
    val status: String = "",
    @SerializedName("total_amount") val totalAmount: Double = 0.0,
    @SerializedName("order_date") val orderDate: String = ""
)

data class OrderFunnelResponse(
    val stages: List<OrderStageItem> = emptyList(),
    val statuses: List<OrderStatusItem> = emptyList(),
    @SerializedName("pending_pipeline") val pendingPipeline: List<PendingOrderItem> = emptyList()
)

// --- AR Aging & RFM ---
data class DebtorItem(
    @SerializedName("customer_id") val customerId: String = "",
    @SerializedName("customer_name") val customerName: String = "",
    @SerializedName("current_due") val currentDue: Double = 0.0,
    @SerializedName("current_status") val currentStatus: String? = "PENDING"
)

data class ARAgingResponse(
    val buckets: Map<String, Double> = emptyMap(),
    @SerializedName("top_debtors") val topDebtors: List<DebtorItem> = emptyList()
)

data class RFMCustomerItem(
    val id: String = "",
    val name: String = "",
    @SerializedName("order_frequency") val orderFrequency: Int = 0,
    @SerializedName("monetary_value") val monetaryValue: Double = 0.0,
    @SerializedName("last_order_date") val lastOrderDate: String? = null,
    @SerializedName("recency_days") val recencyDays: Int? = null,
    val tier: String = "Regular"
)

// --- Product Velocity & Category ---
data class ProductVelocityItem(
    @SerializedName("product_id") val productId: String = "",
    @SerializedName("product_name") val productName: String = "",
    @SerializedName("category_name") val categoryName: String = "Uncategorized",
    @SerializedName("total_units_sold") val totalUnitsSold: Int = 0,
    @SerializedName("total_revenue") val totalRevenue: Double = 0.0
)

data class ExpiringBatchItem(
    @SerializedName("batch_id") val batchId: String = "",
    @SerializedName("batch_no") val batchNo: String = "",
    @SerializedName("product_name") val productName: String = "",
    val mrp: Double = 0.0,
    @SerializedName("exp_date") val expDate: String? = null,
    @SerializedName("units_sold") val unitsSold: Int = 0,
    @SerializedName("days_to_expiry") val daysToExpiry: Int = 0
)

data class ProductVelocityResponse(
    @SerializedName("product_velocity") val productVelocity: List<ProductVelocityItem> = emptyList(),
    @SerializedName("expiring_batches") val expiringBatches: List<ExpiringBatchItem> = emptyList()
)

data class CategoryPerformanceItem(
    val category: String = "Uncategorized",
    @SerializedName("total_qty") val totalQty: Double = 0.0,
    @SerializedName("total_revenue") val totalRevenue: Double = 0.0
)

// --- Comparative Analytics ---
data class YoYResponse(
    val yearMap: Map<String, List<Double>> = emptyMap()
)

data class MoMItem(
    val month: String = "",
    val revenue: Double = 0.0,
    @SerializedName("invoice_count") val invoiceCount: Int = 0,
    @SerializedName("prev_revenue") val prevRevenue: Double = 0.0,
    @SerializedName("variance_amount") val varianceAmount: Double = 0.0,
    @SerializedName("growth_percent") val growthPercent: Double = 0.0
)

data class QoQItem(
    val year: String = "",
    val quarter: String = "",
    val revenue: Double = 0.0,
    @SerializedName("invoice_count") val invoiceCount: Int = 0
)

data class CustomPeriodMetrics(
    val startDate: String = "",
    val endDate: String = "",
    val revenue: Double = 0.0,
    @SerializedName("total_gst") val totalGst: Double = 0.0,
    @SerializedName("total_discount") val totalDiscount: Double = 0.0,
    @SerializedName("invoice_count") val invoiceCount: Int = 0,
    @SerializedName("avg_invoice_value") val avgInvoiceValue: Double = 0.0,
    @SerializedName("total_collected") val totalCollected: Double = 0.0
)

data class CustomPeriodVariance(
    @SerializedName("revenue_diff") val revenueDiff: Double = 0.0,
    @SerializedName("revenue_growth_percent") val revenueGrowthPercent: Double = 0.0
)

data class CustomComparisonResult(
    val periodA: CustomPeriodMetrics? = null,
    val periodB: CustomPeriodMetrics? = null,
    val variance: CustomPeriodVariance? = null
)

// --- Customer Stats Profile ---
data class FavoriteProductItem(
    val name: String = "",
    val frequency: Int = 0
)

data class CustomerStats(
    @SerializedName("avg_order_value") val avgOrderValue: Double = 0.0,
    @SerializedName("favorite_products") val favoriteProducts: List<FavoriteProductItem> = emptyList(),
    @SerializedName("avg_settlement_days") val avgSettlementDays: Double = 0.0,
    @SerializedName("current_due") val currentDue: Double = 0.0,
    @SerializedName("total_sales") val totalSales: Double = 0.0
)

// Generic API response wrapper
data class ApiResponse<T>(
    val success: Boolean = true,
    val message: String? = null,
    val data: T? = null,
    val error: String? = null
)

data class PreviousVersionInfo(
    val versionCode: Int? = null,
    val versionName: String? = null
)

data class AndroidUpdateManifest(
    val versionCode: Int = 1,
    val versionName: String = "1.0.0",
    val apkUrl: String = "/api/android/update/latest",
    val releaseNotes: String = "",
    val publishedAt: String? = null,
    val fileName: String? = "latest.apk",
    val sha256: String? = null,
    val fileSize: Long = 0L,
    val minSdkVersion: Int = 24,
    val previousVersion: PreviousVersionInfo? = null,
    val downloadCount: Int = 0
)

data class AndroidVersionHistory(
    val versionCode: Int = 1,
    val versionName: String = "1.0.0",
    val releaseNotes: String = "",
    val archiveFile: String? = null,
    val archivedAt: String? = null
)

