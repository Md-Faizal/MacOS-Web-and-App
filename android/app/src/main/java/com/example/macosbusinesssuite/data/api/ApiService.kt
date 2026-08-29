package com.example.macosbusinesssuite.data.api

import com.example.macosbusinesssuite.data.model.*
import com.google.gson.JsonElement
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // ==================== AUTH & SECURITY ====================
    @GET("auth/status")
    suspend fun getAuthStatus(): Response<AuthStatusResponse>

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @POST("auth/mobile/refresh")
    suspend fun refreshMobileSession(@Body request: MobileRefreshRequest): Response<LoginResponse>

    @POST("auth/mobile/logout")
    suspend fun logoutMobileSession(@Body request: MobileRefreshRequest): Response<ApiResponse<Unit>>

    @POST("auth/google/worker-login")
    suspend fun googleWorkerLogin(@Body request: Map<String, Any?>): Response<Map<String, Any?>>

    @GET("auth/worker/status")
    suspend fun checkWorkerStatus(
        @Query("inviteCode") inviteCode: String? = null,
        @Query("email") email: String? = null,
        @Query("platform") platform: String? = null,
        @Query("deviceName") deviceName: String? = null
    ): Response<Map<String, Any?>>

    @POST("auth/logout")
    suspend fun logout(): Response<ApiResponse<Unit>>

    @GET("auth/devices")
    suspend fun getDevices(): Response<DevicesResponse>

    @DELETE("auth/devices/{id}")
    suspend fun logoutDevice(@Path("id") id: String): Response<ApiResponse<Unit>>

    @DELETE("auth/devices")
    suspend fun logoutAllDevices(): Response<ApiResponse<Unit>>

    @GET("auth/questions")
    suspend fun getSecurityQuestions(): Response<List<SecurityQuestion>>

    @POST("auth/update-security")
    suspend fun updateSecurity(@Body request: UpdateSecurityRequest): Response<ApiResponse<Unit>>

    @GET("profile/permissions")
    suspend fun getPermissions(): Response<Map<String, Any?>>

    // ==================== PROFILE ====================
    @GET("profile")
    suspend fun getProfile(): Response<ProfileResponse>

    @POST("profile")
    suspend fun updateProfile(@Body request: UpdateProfileRequest): Response<ProfileResponse>

    // ==================== PRODUCTS ====================
    @GET("products")
    suspend fun getProducts(@Query("search") search: String? = null): Response<List<Product>>

    @GET("products/{id}")
    suspend fun getProduct(@Path("id") id: String): Response<Product>

    @POST("products")
    suspend fun createProduct(@Body product: Product): Response<Map<String, Any>>

    @PUT("products/{id}")
    suspend fun updateProduct(@Path("id") id: String, @Body product: Product): Response<Map<String, Any>>

    @DELETE("products/{id}")
    suspend fun deleteProduct(@Path("id") id: String): Response<Map<String, Any>>

    @GET("products/categories")
    suspend fun getCategories(): Response<List<Category>>

    @POST("products/categories")
    suspend fun createCategory(@Body category: Map<String, String>): Response<Map<String, Any>>

    @PUT("products/categories/{id}")
    suspend fun updateCategory(@Path("id") id: String, @Body category: Map<String, String>): Response<Map<String, Any>>

    @DELETE("products/categories/{id}")
    suspend fun deleteCategory(@Path("id") id: String): Response<Map<String, Any>>

    @POST("products/variants")
    suspend fun createVariant(@Body variantData: Map<String, Any>): Response<Map<String, Any>>

    @PUT("products/variants/{id}")
    suspend fun updateVariant(@Path("id") id: String, @Body variantData: Map<String, Any>): Response<Map<String, Any>>

    @POST("products/batches")
    suspend fun createBatch(@Body batchData: Map<String, Any>): Response<Map<String, Any>>

    @PUT("products/batches/{id}")
    suspend fun updateBatch(@Path("id") id: String, @Body batchData: Map<String, Any>): Response<Map<String, Any>>

    @DELETE("products/batches/{id}")
    suspend fun deleteBatch(@Path("id") id: String): Response<Map<String, Any>>

    @POST("products/update-mrp")
    suspend fun updateMRP(@Body request: UpdateMRPRequest): Response<ApiResponse<Unit>>

    // ==================== CONTACTS ====================
    @GET("contacts")
    suspend fun getContacts(@Query("limit") limit: Int = 10000): Response<com.google.gson.JsonElement>

    @GET("contacts/{id}")
    suspend fun getContact(@Path("id") id: String): Response<Contact>

    @POST("contacts")
    suspend fun createContact(@Body contact: Contact): Response<Contact>

    @PUT("contacts/{id}")
    suspend fun updateContact(@Path("id") id: String, @Body contact: Contact): Response<Contact>

    @DELETE("contacts/{id}")
    suspend fun deleteContact(@Path("id") id: String): Response<Unit>

    @GET("contacts/{customerId}/activity-status")
    suspend fun getActivityStatus(@Path("customerId") customerId: String): Response<ActivityStatus>

    // ==================== BILLING ====================
    @GET("billing")
    suspend fun getBills(@Query("limit") limit: Int = 10000): Response<com.google.gson.JsonElement>

    @GET("billing/summary")
    suspend fun getBillingSummary(): Response<JsonElement>

    @GET("billing/invoices/payments/total-collected")
    suspend fun getTotalCollected(): Response<TotalCollectedResponse>

    @POST("billing/invoices/payments")
    suspend fun recordPayment(@Body request: RecordPaymentRequest): Response<com.google.gson.JsonElement>

    @POST("billing/invoices/creditnotes")
    suspend fun recordCreditNote(@Body request: RecordCreditNoteRequest): Response<com.google.gson.JsonElement>

    @GET("billing/invoices/payments/next-reference")
    suspend fun getNextPaymentReference(
        @Query("customer_id") customerId: String?,
        @Query("payment_date") paymentDate: String?
    ): Response<NextReferenceResponse>

    @GET("billing/invoices/payments/next-credit-reference")
    suspend fun getNextCreditReference(
        @Query("customer_id") customerId: String?,
        @Query("payment_date") paymentDate: String?
    ): Response<NextReferenceResponse>

    @GET("billing/invoices/customers/{customerName}/outstanding")
    suspend fun getCustomerOutstanding(
        @Path("customerName") customerName: String
    ): Response<CustomerOutstandingResponse>

    // Remote logging endpoint for mobile clients
    @POST("logs/app")
    suspend fun postAppLog(@Body log: AppLogRequest): Response<ApiResponse<Unit>>

    @GET("android/update/manifest")
    suspend fun getAndroidUpdateManifest(): Response<AndroidUpdateManifest>

    @GET("android/update/history")
    suspend fun getAndroidUpdateHistory(): Response<List<AndroidVersionHistory>>

    @HEAD("android/update/latest")
    suspend fun headAndroidUpdateApk(): Response<Void>

    @GET("android/update/health")
    suspend fun getAndroidUpdateHealth(): Response<Map<String, Any>>

    @POST("billing")
    suspend fun createBill(@Body request: CreateBillRequest): Response<Bill>

    @PUT("billing/{id}")
    suspend fun updateBill(@Path("id") id: String, @Body request: UpdateBillRequest): Response<ApiResponse<Unit>>

    @GET("billing/{id}")
    suspend fun getBill(@Path("id") id: String): Response<Bill>

    @DELETE("billing/{id}")
    suspend fun deleteBill(@Path("id") id: String): Response<Unit>

    @GET("billing/public/ledger/{customerId}")
    suspend fun getDetailedLedger(@Path("customerId") customerId: String): Response<DetailedLedgerResponse>

    @GET("billing/preference/{customerName}/{productName}")
    suspend fun getPreference(
        @Path("customerName") customerName: String,
        @Path("productName") productName: String
    ): Response<CustomerPreference>

    @GET("billing/ledger/customers")
    suspend fun getLedgerCustomers(): Response<List<LedgerCustomer>>

    @GET("billing/invoices/payments")
    suspend fun getPayments(@Query("limit") limit: Int = 10000): Response<com.google.gson.JsonElement>

    @GET("billing/orders")
    suspend fun getOrders(@Query("limit") limit: Int = 10000): Response<com.google.gson.JsonElement>

    @POST("billing/orders")
    suspend fun createOrder(@Body request: CreateOrderRequest): Response<OrderRecord>

    @PUT("billing/orders/{id}")
    suspend fun updateOrder(@Path("id") id: String, @Body request: CreateOrderRequest): Response<OrderRecord>

    @DELETE("billing/orders/{id}")
    suspend fun deleteOrder(@Path("id") id: String): Response<Unit>

    @GET("billing/orders/next-number")
    suspend fun getNextOrderNumber(): Response<NextReferenceResponse>

    // PDF Preview & Export Endpoints
    @POST("billing/preview-invoice-pdf")
    suspend fun previewInvoicePdf(@Body request: Map<String, Any>): Response<okhttp3.ResponseBody>

    @POST("billing/export-invoice-pdf")
    suspend fun exportInvoicePdf(@Body request: Map<String, Any>): Response<okhttp3.ResponseBody>

    @POST("billing/preview-payment-pdf")
    suspend fun previewPaymentPdf(@Body request: Map<String, Any>): Response<okhttp3.ResponseBody>

    @POST("billing/export-payment-pdf")
    suspend fun exportPaymentPdf(@Body request: Map<String, Any>): Response<okhttp3.ResponseBody>

    @POST("billing/preview-opening-balance")
    suspend fun previewOpeningBalancePdf(@Body request: Map<String, Any>): Response<okhttp3.ResponseBody>

    @POST("billing/export-opening-balance")
    suspend fun exportOpeningBalancePdf(@Body request: Map<String, Any>): Response<okhttp3.ResponseBody>

    @DELETE("billing/invoices/payments/{id}")
    suspend fun deletePayment(@Path("id") id: String): Response<Unit>

    @PUT("billing/invoices/payments/{id}")
    suspend fun updatePayment(@Path("id") id: String, @Body request: Map<String, Any>): Response<ApiResponse<Unit>>


    // ==================== ANALYTICS ====================
    @GET("analytics/summary/dashboard")
    suspend fun getDashboardSummary(): Response<AnalyticsSummary>

    @GET("analytics/executive-kpi")
    suspend fun getExecutiveKPI(
        @Query("startDate") startDate: String? = null,
        @Query("endDate") endDate: String? = null
    ): Response<ExecutiveKPI>

    @GET("analytics/sales-trend")
    suspend fun getSalesTrend(): Response<List<SalesTrendPoint>>

    @GET("analytics/top-products")
    suspend fun getTopProducts(): Response<List<TopProductItem>>

    @GET("analytics/top-customers")
    suspend fun getTopCustomers(): Response<List<TopCustomerItem>>

    @GET("analytics/sales-deep-dive")
    suspend fun getSalesDeepDive(
        @Query("period") period: String = "monthly"
    ): Response<SalesDeepDiveResponse>

    @GET("analytics/order-funnel")
    suspend fun getOrderFunnel(): Response<OrderFunnelResponse>

    @GET("analytics/ar-aging")
    suspend fun getARAging(): Response<ARAgingResponse>

    @GET("analytics/rfm-segmentation")
    suspend fun getRFMSegmentation(): Response<List<RFMCustomerItem>>

    @GET("analytics/product-velocity")
    suspend fun getProductVelocity(): Response<ProductVelocityResponse>

    @GET("analytics/category-performance")
    suspend fun getCategoryPerformance(): Response<List<CategoryPerformanceItem>>

    @GET("analytics/comparative-analysis")
    suspend fun getComparativeYoY(
        @Query("type") type: String = "yoy"
    ): Response<YoYResponse>

    @GET("analytics/comparative-analysis")
    suspend fun getComparativeMoM(
        @Query("type") type: String = "mom"
    ): Response<List<MoMItem>>

    @GET("analytics/comparative-analysis")
    suspend fun getComparativeQoQ(
        @Query("type") type: String = "qoq"
    ): Response<List<QoQItem>>

    @GET("analytics/comparative-analysis")
    suspend fun getComparativeCustom(
        @Query("type") type: String = "custom",
        @Query("startDateA") startDateA: String,
        @Query("endDateA") endDateA: String,
        @Query("startDateB") startDateB: String,
        @Query("endDateB") endDateB: String
    ): Response<CustomComparisonResult>

    @GET("analytics/customer/{id}/stats")
    suspend fun getCustomerStats(
        @Path("id") id: String
    ): Response<CustomerStats>
}

