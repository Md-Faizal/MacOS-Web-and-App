package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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

    val filteredBills = remember(bills, searchQuery) {
        bills.filter { it.billNumber.contains(searchQuery, true) || it.customerName.contains(searchQuery, true) }
    }
    val filteredOrders = remember(orders, searchQuery) {
        orders.filter { it.orderNumber.contains(searchQuery, true) || it.customerName.contains(searchQuery, true) }
    }
    val filteredPayments = remember(payments, searchQuery) {
        payments.filter { (it.referenceNo ?: "").contains(searchQuery, true) || it.safeCustomerName.contains(searchQuery, true) }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Edit Transactions", fontWeight = FontWeight.Bold) },
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
            SecondaryTabRow(
                selectedTabIndex = selectedTabIndex,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                Tab(
                    selected = selectedTabIndex == 0,
                    onClick = { selectedTabIndex = 0 },
                    text = { Text("Bills") }
                )
                Tab(
                    selected = selectedTabIndex == 1,
                    onClick = { selectedTabIndex = 1 },
                    text = { Text("Orders") }
                )
                Tab(
                    selected = selectedTabIndex == 2,
                    onClick = { selectedTabIndex = 2 },
                    text = { Text("Payments") }
                )
            }

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                placeholder = { Text("Search by reference or customer...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
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
                            onEdit = { /* TODO: Open Edit Bill Dialog */ },
                            onDelete = {
                                billingViewModel.deleteBill(bill.id) { success, msg ->
                                    scope.launch { snackbarHostState.showSnackbar(if (success) "Bill deleted" else msg ?: "Error") }
                                }
                            }
                        )
                    }
                    1 -> items(filteredOrders) { order ->
                        TransactionItem(
                            title = "Order ${order.orderNumber}",
                            subtitle = order.customerName,
                            amount = "₹${order.totalAmount}",
                            date = order.orderDate,
                            onEdit = { /* TODO: Open Edit Order Dialog */ },
                            onDelete = {
                                billingViewModel.deleteOrder(order.id) { success, msg ->
                                    scope.launch { snackbarHostState.showSnackbar(if (success) "Order deleted" else msg ?: "Error") }
                                }
                            }
                        )
                    }
                    2 -> items(filteredPayments) { payment ->
                        TransactionItem(
                            title = "${payment.type} ${payment.referenceNo}",
                            subtitle = payment.customerName,
                            amount = "₹${payment.effectiveAmount}",
                            date = payment.paymentDate,
                            onEdit = { /* TODO: Open Edit Payment Dialog */ },
                            onDelete = {
                                // TODO: Implement deletePayment in ViewModel if needed
                                scope.launch { snackbarHostState.showSnackbar("Payment deletion not yet implemented") }
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TransactionItem(
    title: String,
    subtitle: String,
    amount: String,
    date: String,
    onEdit: () -> Unit,
    onDelete: () -> Unit
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
            Row {
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
