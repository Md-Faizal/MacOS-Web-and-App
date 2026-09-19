package com.example.macosbusinesssuite.ui.screens.billing

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.Bill
import com.example.macosbusinesssuite.data.model.OrderRecord
import com.example.macosbusinesssuite.data.model.PaymentRecord
import com.example.macosbusinesssuite.ui.components.PixelStatusBadge
import com.example.macosbusinesssuite.ui.components.appMarquee
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingHistoryScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    val context = LocalContext.current
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }

    val bills by billingViewModel.bills.collectAsState()
    val payments by billingViewModel.payments.collectAsState()
    val orders by billingViewModel.orders.collectAsState()
    val contacts by billingViewModel.contacts.collectAsState()
    val isLoading by billingViewModel.isLoading.collectAsState()

    // Action sheet states
    var selectedBill by remember { mutableStateOf<Bill?>(null) }
    var selectedPayment by remember { mutableStateOf<PaymentRecord?>(null) }
    var selectedCreditNote by remember { mutableStateOf<PaymentRecord?>(null) }
    var selectedOrder by remember { mutableStateOf<OrderRecord?>(null) }

    // Dialog states
    var showPreviewDialog by remember { mutableStateOf(false) }
    var previewBytes by remember { mutableStateOf<ByteArray?>(null) }
    var previewTitle by remember { mutableStateOf("") }

    var showAttachmentDialog by remember { mutableStateOf(false) }
    var attachmentBase64 by remember { mutableStateOf<String?>(null) }

    var itemToDelete by remember { mutableStateOf<Pair<String, String>?>(null) } // Pair(Type, Id)
    var orderToConvert by remember { mutableStateOf<OrderRecord?>(null) }

    // Helper to resolve customer ID for navigation
    fun resolveCustomerId(id: String?, name: String?): String? {
        if (!id.isNullOrBlank()) return id
        if (!name.isNullOrBlank()) {
            return contacts.find { it.name.equals(name, ignoreCase = true) }?.id
        }
        return null
    }

    val filteredBills = remember(bills, searchQuery) {
        bills.filter { it.billNumber.contains(searchQuery, true) || it.customerName.contains(searchQuery, true) }
    }
    val filteredPayments = remember(payments, searchQuery) {
        payments.filter {
            !it.safeType.contains("CREDIT", true) && !it.safeType.contains("CN", true) &&
            ((it.referenceNo ?: "").contains(searchQuery, true) || it.safeCustomerName.contains(searchQuery, true))
        }
    }
    val filteredCreditNotes = remember(payments, searchQuery) {
        payments.filter {
            (it.safeType.contains("CREDIT", true) || it.safeType.contains("CN", true)) &&
            ((it.referenceNo ?: "").contains(searchQuery, true) || it.safeCustomerName.contains(searchQuery, true))
        }
    }
    val filteredOrders = remember(orders, searchQuery) {
        orders.filter { it.orderNumber.contains(searchQuery, true) || it.customerName.contains(searchQuery, true) }
    }

    // Top KPI ribbon metrics
    val totalInvoiced = remember(bills) { bills.sumOf { it.grandTotal } }
    val totalCollected = remember(payments) {
        payments.filter { !it.safeType.contains("CREDIT", true) && !it.safeType.contains("CN", true) }.sumOf { it.effectiveAmount }
    }
    val totalOrdersCount = remember(orders) { orders.size }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Billing History & Pipeline", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp).padding(end = 16.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        IconButton(onClick = { billingViewModel.loadBillingData() }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Enterprise KPI Ribbon
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "TOTAL INVOICED",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "₹${"%,.2f".format(totalInvoiced)}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Box(modifier = Modifier.width(1.dp).height(32.dp).padding(vertical = 4.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "TOTAL COLLECTED",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "₹${"%,.2f".format(totalCollected)}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.tertiary
                        )
                    }
                    Box(modifier = Modifier.width(1.dp).height(32.dp).padding(vertical = 4.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "PIPELINE ORDERS",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "$totalOrdersCount orders",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            // PrimaryTabRow
            PrimaryTabRow(
                selectedTabIndex = selectedTabIndex,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                Tab(
                    selected = selectedTabIndex == 0,
                    onClick = { selectedTabIndex = 0 },
                    text = { Text("Bills (${filteredBills.size})", fontWeight = FontWeight.SemiBold) }
                )
                Tab(
                    selected = selectedTabIndex == 1,
                    onClick = { selectedTabIndex = 1 },
                    text = { Text("Payments (${filteredPayments.size})", fontWeight = FontWeight.SemiBold) }
                )
                Tab(
                    selected = selectedTabIndex == 2,
                    onClick = { selectedTabIndex = 2 },
                    text = { Text("Credits (${filteredCreditNotes.size})", fontWeight = FontWeight.SemiBold) }
                )
                Tab(
                    selected = selectedTabIndex == 3,
                    onClick = { selectedTabIndex = 3 },
                    text = { Text("Orders (${filteredOrders.size})", fontWeight = FontWeight.SemiBold) }
                )
            }

            // Search Bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                placeholder = { Text("Search by reference, invoice, or customer...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear search")
                        }
                    }
                },
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            val marqueeEnabled = billingViewModel.sessionManager.marqueeEnabled
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 80.dp)
            ) {
                when (selectedTabIndex) {
                    0 -> items(filteredBills, key = { it.id }) { bill ->
                        HistoryCard(
                            title = bill.billNumber.ifEmpty { "INV-${bill.id.takeLast(6)}" },
                            subtitle = bill.customerName.ifBlank { "Customer" },
                            amount = "₹${"%,.2f".format(bill.grandTotal)}",
                            date = bill.date,
                            info = "${bill.items.size} item(s) • ${bill.paymentMode}",
                            statusBadge = bill.status,
                            marqueeEnabled = marqueeEnabled,
                            onClick = { selectedBill = bill }
                        )
                    }
                    1 -> items(filteredPayments, key = { it.id }) { payment ->
                        HistoryCard(
                            title = payment.referenceNo ?: "Payment",
                            subtitle = payment.safeCustomerName,
                            amount = "-₹${"%,.2f".format(payment.effectiveAmount)}",
                            date = payment.safePaymentDate,
                            info = "${payment.safeType} • ${payment.safePaymentMedium}${if (!payment.attachmentData.isNullOrBlank()) " • 📎 Attachment" else ""}",
                            statusBadge = "PAYMENT",
                            marqueeEnabled = marqueeEnabled,
                            onClick = { selectedPayment = payment }
                        )
                    }
                    2 -> items(filteredCreditNotes, key = { it.id }) { credit ->
                        HistoryCard(
                            title = credit.referenceNo ?: "Credit Note",
                            subtitle = credit.safeCustomerName,
                            amount = "₹${"%,.2f".format(credit.effectiveAmount)}",
                            date = credit.safePaymentDate,
                            info = "${credit.safeType} • Credit Note",
                            statusBadge = "CREDIT",
                            marqueeEnabled = marqueeEnabled,
                            onClick = { selectedCreditNote = credit }
                        )
                    }
                    3 -> items(filteredOrders, key = { it.id }) { order ->
                        val stageLabel = when (order.currentStage.lowercase()) {
                            "stage1" -> "Draft / Intake"
                            "stage2" -> "QC / Packing"
                            "stage3" -> "Dispatch"
                            else -> order.currentStage
                        }
                        HistoryCard(
                            title = order.orderNumber.ifEmpty { "ORD-${order.id.takeLast(6)}" },
                            subtitle = order.customerName.ifBlank { "Customer" },
                            amount = "₹${"%,.2f".format(order.totalAmount)}",
                            date = order.orderDate,
                            info = "Stage: $stageLabel • Status: ${order.status.uppercase()}",
                            statusBadge = order.status,
                            marqueeEnabled = marqueeEnabled,
                            onClick = { selectedOrder = order }
                        )
                    }
                }
            }
        }
    }

    // ==================== BOTTOM SHEETS ====================

    // 1. Bill Action Sheet
    if (selectedBill != null) {
        val bill = selectedBill!!
        ModalBottomSheet(onDismissRequest = { selectedBill = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "Invoice ${bill.billNumber.ifEmpty { bill.id }}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${bill.customerName} • ₹${"%,.2f".format(bill.grandTotal)} • ${bill.date}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))

                ListItem(
                    headlineContent = { Text("View Document Preview") },
                    leadingContent = { Icon(Icons.Default.Visibility, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val bNo = bill.billNumber
                        val cName = bill.customerName
                        selectedBill = null
                        billingViewModel.fetchPreviewBytes("invoice", bNo, cName) { bytes, err ->
                            if (bytes != null) {
                                previewBytes = bytes
                                previewTitle = "Invoice $bNo"
                                showPreviewDialog = true
                            } else {
                                Toast.makeText(context, err ?: "Failed to load invoice preview", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )

                ListItem(
                    headlineContent = { Text("Export & Share PDF") },
                    leadingContent = { Icon(Icons.Default.Download, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val bNo = bill.billNumber
                        val cName = bill.customerName
                        selectedBill = null
                        billingViewModel.exportPdfBytes("invoice", bNo, cName) { bytes, err ->
                            if (bytes != null) {
                                sharePdfFile(context, "Invoice-$bNo.pdf", bytes)
                            } else {
                                Toast.makeText(context, err ?: "Failed to export PDF", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )

                ListItem(
                    headlineContent = { Text("View in Customer Ledger") },
                    leadingContent = { Icon(Icons.Default.AccountBalance, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val targetCustId = resolveCustomerId(bill.customerId, bill.customerName)
                        selectedBill = null
                        if (targetCustId != null) {
                            navController.navigate("detailed_ledger/$targetCustId")
                        } else {
                            Toast.makeText(context, "Customer account not found", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                ListItem(
                    headlineContent = { Text("Delete Invoice", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable {
                        val id = bill.id
                        selectedBill = null
                        itemToDelete = Pair("Invoice", id)
                    }
                )
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // 2. Payment Action Sheet
    if (selectedPayment != null) {
        val payment = selectedPayment!!
        ModalBottomSheet(onDismissRequest = { selectedPayment = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "Payment ${payment.referenceNo ?: payment.id}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${payment.safeCustomerName} • ₹${"%,.2f".format(payment.effectiveAmount)} • ${payment.safePaymentDate}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))

                ListItem(
                    headlineContent = { Text("View Receipt Preview") },
                    leadingContent = { Icon(Icons.Default.Visibility, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val pId = payment.id
                        val cName = payment.safeCustomerName
                        selectedPayment = null
                        billingViewModel.fetchPreviewBytes("payment", pId, cName) { bytes, err ->
                            if (bytes != null) {
                                previewBytes = bytes
                                previewTitle = "Receipt ${payment.referenceNo ?: pId}"
                                showPreviewDialog = true
                            } else {
                                Toast.makeText(context, err ?: "Failed to load receipt preview", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )

                if (!payment.attachmentData.isNullOrBlank()) {
                    ListItem(
                        headlineContent = { Text("View Attachment Image") },
                        leadingContent = { Icon(Icons.Default.Image, contentDescription = null) },
                        modifier = Modifier.clickable {
                            val base64 = payment.attachmentData
                            selectedPayment = null
                            attachmentBase64 = base64
                            showAttachmentDialog = true
                        }
                    )
                }

                ListItem(
                    headlineContent = { Text("View in Customer Ledger") },
                    leadingContent = { Icon(Icons.Default.AccountBalance, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val targetCustId = resolveCustomerId(payment.customerId, payment.safeCustomerName)
                        selectedPayment = null
                        if (targetCustId != null) {
                            navController.navigate("detailed_ledger/$targetCustId")
                        } else {
                            Toast.makeText(context, "Customer account not found", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                ListItem(
                    headlineContent = { Text("Delete Payment", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable {
                        val id = payment.id
                        selectedPayment = null
                        itemToDelete = Pair("Payment", id)
                    }
                )
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // 3. Credit Note Action Sheet
    if (selectedCreditNote != null) {
        val credit = selectedCreditNote!!
        ModalBottomSheet(onDismissRequest = { selectedCreditNote = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Text(
                    text = "Credit Note ${credit.referenceNo ?: credit.id}",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${credit.safeCustomerName} • ₹${"%,.2f".format(credit.effectiveAmount)} • ${credit.safePaymentDate}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))

                ListItem(
                    headlineContent = { Text("View Credit Note Preview") },
                    leadingContent = { Icon(Icons.Default.Visibility, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val cId = credit.id
                        val cName = credit.safeCustomerName
                        selectedCreditNote = null
                        billingViewModel.fetchPreviewBytes("credit-note", cId, cName) { bytes, err ->
                            if (bytes != null) {
                                previewBytes = bytes
                                previewTitle = "Credit Note ${credit.referenceNo ?: cId}"
                                showPreviewDialog = true
                            } else {
                                Toast.makeText(context, err ?: "Failed to load credit note preview", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )

                ListItem(
                    headlineContent = { Text("View in Customer Ledger") },
                    leadingContent = { Icon(Icons.Default.AccountBalance, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val targetCustId = resolveCustomerId(credit.customerId, credit.safeCustomerName)
                        selectedCreditNote = null
                        if (targetCustId != null) {
                            navController.navigate("detailed_ledger/$targetCustId")
                        } else {
                            Toast.makeText(context, "Customer account not found", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                ListItem(
                    headlineContent = { Text("Delete Credit Note", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable {
                        val id = credit.id
                        selectedCreditNote = null
                        itemToDelete = Pair("Credit Note", id)
                    }
                )
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // 4. Order Action Sheet & Direct Order-to-Invoice Conversion
    if (selectedOrder != null) {
        val order = selectedOrder!!
        val isCompleted = order.status.lowercase() == "completed" || order.status.lowercase() == "fulfilled"
        val stageLabel = when (order.currentStage.lowercase()) {
            "stage1" -> "Draft / Intake (Stage 1)"
            "stage2" -> "QC / Packing (Stage 2)"
            "stage3" -> "Dispatch (Stage 3)"
            else -> order.currentStage
        }

        ModalBottomSheet(onDismissRequest = { selectedOrder = null }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Order ${order.orderNumber.ifEmpty { order.id }}",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    PixelStatusBadge(order.status)
                }
                Text(
                    text = "${order.customerName} • ₹${"%,.2f".format(order.totalAmount)} • ${order.orderDate}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surfaceContainerHighest,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Pipeline Stage: $stageLabel",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }

                if (order.orderNotes.isNotBlank()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Notes: ${order.orderNotes}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                if (order.items.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Order Items (${order.items.size}):",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold
                    )
                    order.items.forEach { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "${item.productName} × ${item.orderedQty}",
                                style = MaterialTheme.typography.bodySmall
                            )
                            Text(
                                text = "₹${"%,.2f".format(item.amount)}",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Conversion Button (Matching Web Order-to-Invoice fulfillment)
                if (!isCompleted) {
                    Button(
                        onClick = {
                            val ord = order
                            selectedOrder = null
                            orderToConvert = ord
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Convert to Tax Invoice", fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                ListItem(
                    headlineContent = { Text("View in Customer Ledger") },
                    leadingContent = { Icon(Icons.Default.AccountBalance, contentDescription = null) },
                    modifier = Modifier.clickable {
                        val targetCustId = resolveCustomerId(order.customerId, order.customerName)
                        selectedOrder = null
                        if (targetCustId != null) {
                            navController.navigate("detailed_ledger/$targetCustId")
                        } else {
                            Toast.makeText(context, "Customer account not found", Toast.LENGTH_SHORT).show()
                        }
                    }
                )

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // ==================== CONFIRMATION DIALOGS ====================

    // Delete Confirmation Dialog
    if (itemToDelete != null) {
        val (type, id) = itemToDelete!!
        AlertDialog(
            onDismissRequest = { itemToDelete = null },
            title = { Text("Delete $type") },
            text = { Text("Are you sure you want to permanently delete this $type? This action cannot be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        itemToDelete = null
                        if (type == "Invoice") {
                            billingViewModel.deleteBill(id) { success, msg ->
                                Toast.makeText(context, msg ?: if (success) "Invoice deleted" else "Failed to delete", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            billingViewModel.deletePayment(id) { success, msg ->
                                Toast.makeText(context, msg ?: if (success) "$type deleted" else "Failed to delete", Toast.LENGTH_SHORT).show()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { itemToDelete = null }) { Text("Cancel") }
            }
        )
    }

    // Convert Order to Invoice Confirmation Dialog
    if (orderToConvert != null) {
        val ord = orderToConvert!!
        AlertDialog(
            onDismissRequest = { orderToConvert = null },
            title = { Text("Convert Order to Tax Invoice") },
            text = {
                Text("Convert Order ${ord.orderNumber.ifEmpty { ord.id }} to an authoritative tax invoice? The server will automatically fulfill the order, calculate tax totals, deduct inventory, and post the balance to the customer ledger.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        val ordId = ord.id
                        orderToConvert = null
                        billingViewModel.convertOrderToInvoice(ordId) { success, msg ->
                            Toast.makeText(
                                context,
                                if (success) "✓ Order converted to invoice successfully!" else msg ?: "Conversion failed",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                ) {
                    Text("Convert to Invoice", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { orderToConvert = null }) { Text("Cancel") }
            }
        )
    }

    // Document Preview Dialog
    if (showPreviewDialog && previewBytes != null) {
        ZoomablePreviewDialog(previewTitle, previewBytes!!) { showPreviewDialog = false }
    }

    // Attachment Dialog
    if (showAttachmentDialog && attachmentBase64 != null) {
        ZoomableAttachmentDialog(attachmentBase64!!) { showAttachmentDialog = false }
    }
}

@Composable
fun HistoryCard(
    title: String,
    subtitle: String,
    amount: String,
    date: String,
    info: String,
    statusBadge: String? = null,
    marqueeEnabled: Boolean,
    onClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = date,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                modifier = Modifier.appMarquee(marqueeEnabled)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (!statusBadge.isNullOrBlank()) {
                        PixelStatusBadge(statusBadge)
                    }
                    Text(
                        text = info,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = amount,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}
