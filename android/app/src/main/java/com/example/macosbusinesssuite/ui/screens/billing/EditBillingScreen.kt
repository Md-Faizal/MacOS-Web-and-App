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

    // Edit Bill Dialog
    editingBill?.let { bill ->
        var dueDate by remember { mutableStateOf(bill.dueDate ?: "") }
        var invoiceDate by remember { mutableStateOf(bill.date) }
        AlertDialog(
            onDismissRequest = { editingBill = null },
            title = { Text("Edit Bill ${bill.billNumber}") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Customer: ${bill.customerName}", fontWeight = FontWeight.SemiBold)
                    Text("Amount: ₹${bill.grandTotal}", color = MaterialTheme.colorScheme.primary)
                    OutlinedTextField(
                        value = invoiceDate,
                        onValueChange = { invoiceDate = it },
                        label = { Text("Bill Date") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = dueDate,
                        onValueChange = { dueDate = it },
                        label = { Text("Due Date") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(onClick = {
                    val req = UpdateBillRequest(
                        invoiceDate = invoiceDate.ifBlank { null },
                        dueDate = dueDate.ifBlank { null }
                    )
                    billingViewModel.updateBill(bill.id, req) { success, msg ->
                        editingBill = null
                        scope.launch {
                            snackbarHostState.showSnackbar(if (success) "✓ Bill updated" else msg ?: "Error updating bill")
                        }
                    }
                }) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { editingBill = null }) { Text("Cancel") }
            }
        )
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
