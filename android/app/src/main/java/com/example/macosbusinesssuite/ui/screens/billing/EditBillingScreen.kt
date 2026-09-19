package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.Bill
import com.example.macosbusinesssuite.data.model.OrderRecord
import com.example.macosbusinesssuite.data.model.PaymentRecord
import com.example.macosbusinesssuite.data.model.UpdateBillRequest
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.filled.Add
import com.example.macosbusinesssuite.data.model.BillItem
import com.example.macosbusinesssuite.data.model.CalculateBillItemRequest
import com.example.macosbusinesssuite.data.model.CalculateBillRequest
import com.example.macosbusinesssuite.data.model.CalculateBillResponse
import com.example.macosbusinesssuite.ui.screens.billing.components.AddProductDialog
import com.example.macosbusinesssuite.domain.calculation.BillCalculator
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditBillingScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val bills by billingViewModel.bills.collectAsState()
    val orders by billingViewModel.orders.collectAsState()
    val payments by billingViewModel.payments.collectAsState()

    var editingBill by remember { mutableStateOf<Bill?>(null) }
    var editingPayment by remember { mutableStateOf<PaymentRecord?>(null) }
    var deletingItem by remember { mutableStateOf<Triple<String, String, String>?>(null) }
    var convertingOrder by remember { mutableStateOf<OrderRecord?>(null) }

    val filteredBills = remember(bills, searchQuery) {
        bills.filter { it.billNumber.contains(searchQuery, true) || it.customerName.contains(searchQuery, true) }
    }
    val filteredOrders = remember(orders, searchQuery) {
        orders.filter { it.orderNumber.contains(searchQuery, true) || it.customerName.contains(searchQuery, true) }
    }
    val filteredPayments = remember(payments, searchQuery) {
        payments.filter { (it.referenceNo ?: "").contains(searchQuery, true) || (it.customerName ?: "").contains(searchQuery, true) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Manage Records", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
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
            TabRow(selectedTabIndex = selectedTabIndex) {
                Tab(
                    selected = selectedTabIndex == 0,
                    onClick = { selectedTabIndex = 0 },
                    text = { Text("Invoices (${filteredBills.size})") }
                )
                Tab(
                    selected = selectedTabIndex == 1,
                    onClick = { selectedTabIndex = 1 },
                    text = { Text("Orders (${filteredOrders.size})") }
                )
                Tab(
                    selected = selectedTabIndex == 2,
                    onClick = { selectedTabIndex = 2 },
                    text = { Text("Payments (${filteredPayments.size})") }
                )
            }

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search records...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                when (selectedTabIndex) {
                    0 -> items(filteredBills) { bill ->
                        TransactionItem(
                            title = "Bill ${bill.billNumber}",
                            subtitle = bill.customerName,
                            amount = "₹${bill.grandTotal}",
                            date = bill.date,
                            onEdit = { editingBill = bill },
                            onDelete = { deletingItem = Triple("bill", bill.id, "Bill ${bill.billNumber}") }
                        )
                    }
                    1 -> items(filteredOrders) { order ->
                        TransactionItem(
                            title = "Order ${order.orderNumber}",
                            subtitle = "${order.customerName} • ${order.currentStage.uppercase()} • ${order.status}",
                            amount = "₹${order.totalAmount}",
                            date = order.orderDate,
                            extraAction = {
                                if (!order.status.equals("completed", ignoreCase = true)) {
                                    IconButton(
                                        onClick = { convertingOrder = order },
                                        modifier = Modifier.size(36.dp)
                                    ) {
                                        Icon(
                                            Icons.Default.CheckCircle,
                                            contentDescription = "Convert Order to Bill",
                                            tint = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                }
                            },
                            onEdit = {
                                scope.launch {
                                    snackbarHostState.showSnackbar("Tap the check icon to convert to Bill, or delete to cancel.")
                                }
                            },
                            onDelete = { deletingItem = Triple("order", order.id, "Order ${order.orderNumber}") }
                        )
                    }
                    2 -> items(filteredPayments) { payment ->
                        TransactionItem(
                            title = "${payment.type} ${payment.referenceNo ?: ""}",
                            subtitle = payment.customerName ?: "Customer",
                            amount = "₹${payment.effectiveAmount}",
                            date = payment.paymentDate ?: "",
                            onEdit = { editingPayment = payment },
                            onDelete = { deletingItem = Triple("payment", payment.id, "${payment.type} ${payment.referenceNo ?: ""}") }
                        )
                    }
                }
            }
        }
    }

    // Convert Order Confirmation Dialog
    convertingOrder?.let { order ->
        AlertDialog(
            onDismissRequest = { convertingOrder = null },
            title = { Text("Convert Order to Invoice") },
            text = {
                Text("Convert Order ${order.orderNumber} to an authoritative invoice? The server will automatically fulfill the order, calculate totals, deduct inventory, and post to customer receivables.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        val oId = order.id
                        convertingOrder = null
                        billingViewModel.convertOrderToInvoice(oId) { success, msg ->
                            scope.launch {
                                snackbarHostState.showSnackbar(if (success) "✓ Order converted to invoice" else msg ?: "Conversion failed")
                            }
                        }
                    }
                ) {
                    Text("Convert to Invoice")
                }
            },
            dismissButton = {
                TextButton(onClick = { convertingOrder = null }) { Text("Cancel") }
            }
        )
    }

    // Delete Confirmation Dialog
    deletingItem?.let { (type, id, name) ->
        AlertDialog(
            onDismissRequest = { deletingItem = null },
            title = { Text("Confirm Deletion") },
            text = { Text("Are you sure you want to permanently delete $name? This action will adjust customer ledger dues.") },
            confirmButton = {
                Button(
                    onClick = {
                        deletingItem = null
                        when (type) {
                            "bill" -> billingViewModel.deleteBill(id) { success, msg ->
                                scope.launch { snackbarHostState.showSnackbar(if (success) "✓ Bill deleted" else msg ?: "Error deleting bill") }
                            }
                            "order" -> billingViewModel.deleteOrder(id) { success, msg ->
                                scope.launch { snackbarHostState.showSnackbar(if (success) "✓ Order deleted" else msg ?: "Error deleting order") }
                            }
                            "payment" -> billingViewModel.deletePayment(id) { success, msg ->
                                scope.launch { snackbarHostState.showSnackbar(if (success) "✓ Payment deleted" else msg ?: "Error deleting payment") }
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingItem = null }) { Text("Cancel") }
            }
        )
    }

    // Edit Bill Dialog with full line items support and server-side recalculation
    editingBill?.let { bill ->
        val productCatalog by billingViewModel.products.collectAsState()
        var dueDate by remember { mutableStateOf(bill.dueDate ?: "") }
        var invoiceDate by remember { mutableStateOf(bill.date) }
        var showAddItemDialog by remember { mutableStateOf(false) }

        var editItems by remember(bill) {
            mutableStateOf(
                bill.items.map { item ->
                    CalculateBillItemRequest(
                        productId = item.productId.ifBlank { null },
                        productName = item.productName,
                        variantId = item.variantId,
                        batchId = item.batchId,
                        batchNo = item.batchNo,
                        qty = item.quantity,
                        rate = item.rate,
                        mrp = item.rate,
                        disc1 = item.discount1Percent,
                        disc2 = item.discount2Percent,
                        gstPercent = item.gstPercent,
                        gstReverse = false
                    )
                }
            )
        }

        var serverCalcResult by remember { mutableStateOf<CalculateBillResponse?>(null) }
        var isRecalculating by remember { mutableStateOf(false) }

        // 1. Instant Client-Side Calculation (0ms latency)
        LaunchedEffect(editItems) {
            if (editItems.isNotEmpty()) {
                val instant = BillCalculator.calculate(
                    items = editItems,
                    customer = null,
                    roundOffEnabled = true
                )
                serverCalcResult = serverCalcResult?.let { prev ->
                    instant.copy(
                        previousDue = prev.previousDue,
                        projectedDue = BillCalculator.round2(prev.previousDue + instant.summary.grandTotal)
                    )
                } ?: instant
            } else {
                serverCalcResult = null
            }
        }

        // 2. Debounced Background Server Verification
        LaunchedEffect(editItems, invoiceDate) {
            if (editItems.isNotEmpty()) {
                delay(200)
                isRecalculating = true
                val calcReq = CalculateBillRequest(
                    customerId = bill.customerId,
                    customerName = bill.customerName,
                    items = editItems,
                    roundOffEnabled = true,
                    invoiceDate = invoiceDate.ifBlank { null }
                )
                billingViewModel.calculateBill(calcReq) { response ->
                    if (response != null && response.success) {
                        serverCalcResult = response
                    }
                    isRecalculating = false
                }
            } else {
                isRecalculating = false
            }
        }

        AlertDialog(
            onDismissRequest = { editingBill = null },
            title = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Edit Bill ${bill.billNumber}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                    if (isRecalculating) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    }
                }
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 520.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Customer: ${bill.customerName}", fontWeight = FontWeight.SemiBold)
                        val grandTotalDisplay = serverCalcResult?.summary?.grandTotal ?: bill.grandTotal
                        Text("Total: ₹$grandTotalDisplay", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = invoiceDate,
                            onValueChange = { invoiceDate = it },
                            label = { Text("Bill Date") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = dueDate,
                            onValueChange = { dueDate = it },
                            label = { Text("Due Date") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                    }

                    // Line Items Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Line Items (${editItems.size})", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleSmall)
                        FilledTonalButton(
                            onClick = { showAddItemDialog = true },
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Add Item", style = MaterialTheme.typography.labelMedium)
                        }
                    }

                    if (editItems.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("No items in invoice. Tap 'Add Item' to add.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f, fill = false),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val displayItems = serverCalcResult?.items
                            itemsIndexed(editItems) { idx, itm ->
                                val calcItem = displayItems?.getOrNull(idx)
                                Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(
                                                calcItem?.productName ?: itm.productName ?: "Item",
                                                fontWeight = FontWeight.Bold,
                                                style = MaterialTheme.typography.bodyMedium
                                            )
                                            val q = calcItem?.qty ?: itm.qty
                                            val r = calcItem?.rate ?: itm.rate
                                            val amt = calcItem?.amount ?: (q * r)
                                            Text("Qty: $q × ₹$r = ₹$amt", style = MaterialTheme.typography.bodySmall)
                                            val gst = calcItem?.gstPercent ?: itm.gstPercent
                                            if (gst > 0) {
                                                Text("GST: $gst% (₹${calcItem?.gstAmount ?: 0.0})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                                            }
                                        }
                                        val finalVal = calcItem?.finalAmount ?: (itm.rate * itm.qty)
                                        Text("₹$finalVal", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 4.dp))
                                        IconButton(
                                            onClick = {
                                                editItems = editItems.toMutableList().also { it.removeAt(idx) }
                                            },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(Icons.Default.Delete, contentDescription = "Delete Item", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Summary Section
                    val summary = serverCalcResult?.summary
                    if (summary != null) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(8.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Subtotal", style = MaterialTheme.typography.bodySmall)
                                    Text("₹${summary.subtotal}", style = MaterialTheme.typography.bodySmall)
                                }
                                if (summary.totalDiscount > 0) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("Discount", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                        Text("-₹${summary.totalDiscount}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                                if (summary.totalGst > 0) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("GST", style = MaterialTheme.typography.bodySmall)
                                        Text("₹${summary.totalGst}", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Grand Total", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall)
                                    Text("₹${summary.grandTotal}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val finalProducts = (serverCalcResult?.items ?: emptyList()).map { item ->
                            BillItem(
                                productId = item.productId ?: "",
                                productName = item.productName,
                                variantId = item.variantId,
                                batchId = item.batchId,
                                batchNo = item.batchNo,
                                quantity = item.qty,
                                rate = item.rate,
                                amount = item.amount,
                                discount1Percent = item.discount1Percent,
                                discount1Amount = item.discount1Amount,
                                discount2Percent = item.discount2Percent,
                                discount2Amount = item.discount2Amount,
                                gstPercent = item.gstPercent,
                                gstAmount = item.gstAmount,
                                finalAmount = item.finalAmount
                            )
                        }.ifEmpty {
                            editItems.map { itm ->
                                BillItem(
                                    productId = itm.productId ?: "",
                                    productName = itm.productName ?: "Item",
                                    quantity = itm.qty,
                                    rate = itm.rate,
                                    amount = itm.qty * itm.rate,
                                    discount1Percent = itm.disc1,
                                    discount2Percent = itm.disc2,
                                    gstPercent = itm.gstPercent,
                                    finalAmount = itm.qty * itm.rate
                                )
                            }
                        }

                        val req = UpdateBillRequest(
                            invoiceDate = invoiceDate.ifBlank { null },
                            dueDate = dueDate.ifBlank { null },
                            products = finalProducts.ifEmpty { null }
                        )

                        billingViewModel.updateBill(bill.id, req) { success, msg ->
                            editingBill = null
                            scope.launch {
                                snackbarHostState.showSnackbar(if (success) "✓ Bill updated" else msg ?: "Error updating bill")
                            }
                        }
                    },
                    enabled = editItems.isNotEmpty()
                ) {
                    Text("Save Changes")
                }
            },
            dismissButton = {
                TextButton(onClick = { editingBill = null }) { Text("Cancel") }
            }
        )

        if (showAddItemDialog) {
            AddProductDialog(
                products = productCatalog,
                onDismiss = { showAddItemDialog = false },
                onAdd = { _, itemReq ->
                    editItems = editItems + itemReq
                    showAddItemDialog = false
                }
            )
        }
    }

    // Edit Payment Dialog
    editingPayment?.let { payment ->
        var refNo by remember { mutableStateOf(payment.referenceNo ?: "") }
        var amountStr by remember { mutableStateOf(payment.effectiveAmount.toString()) }
        var paymentDate by remember { mutableStateOf(payment.paymentDate) }

        AlertDialog(
            onDismissRequest = { editingPayment = null },
            title = { Text("Edit ${payment.type} Record") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Customer: ${payment.customerName.ifBlank { "Customer" }}", fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = refNo,
                        onValueChange = { refNo = it },
                        label = { Text("Reference #") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = amountStr,
                        onValueChange = { amountStr = it },
                        label = { Text("Amount (₹)") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = paymentDate,
                        onValueChange = { paymentDate = it },
                        label = { Text("Date") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    val amt = amountStr.toDoubleOrNull()
                    if (amt == null || amt <= 0.0) {
                        scope.launch { snackbarHostState.showSnackbar("Please enter a valid amount") }
                    } else {
                        val req = mutableMapOf<String, Any>(
                            "amount" to amt
                        )
                        if (paymentDate.isNotBlank()) req["payment_date"] = paymentDate
                        if (refNo.isNotBlank()) req["reference_no"] = refNo
                        billingViewModel.updatePayment(payment.id, req) { success, msg ->
                            editingPayment = null
                            scope.launch {
                                snackbarHostState.showSnackbar(if (success) "✓ Payment updated" else msg ?: "Error updating payment")
                            }
                        }
                    }
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { editingPayment = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
fun TransactionItem(
    title: String,
    subtitle: String,
    amount: String,
    date: String,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    extraAction: (@Composable () -> Unit)? = null
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodyMedium)
                Text(date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(amount, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(horizontal = 8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                extraAction?.invoke()
                IconButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "Edit", tint = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
