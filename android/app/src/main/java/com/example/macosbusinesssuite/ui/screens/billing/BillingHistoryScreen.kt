package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.example.macosbusinesssuite.ui.components.appMarquee
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingHistoryScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    var selectedTabIndex by remember { mutableIntStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }
    
    val bills by billingViewModel.bills.collectAsState()
    val payments by billingViewModel.payments.collectAsState()
    val orders by billingViewModel.orders.collectAsState()

    val filteredBills = remember(bills, searchQuery) {
        bills.filter { it.billNumber.contains(searchQuery, true) || (it.customerName ?: "").contains(searchQuery, true) }
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
        orders.filter { it.orderNumber.contains(searchQuery, true) || (it.customerName ?: "").contains(searchQuery, true) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Billing History", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
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
            TabRow(
                selectedTabIndex = selectedTabIndex,
                containerColor = MaterialTheme.colorScheme.surface
            ) {
                Tab(selected = selectedTabIndex == 0, onClick = { selectedTabIndex = 0 }, text = { Text("Bills") })
                Tab(selected = selectedTabIndex == 1, onClick = { selectedTabIndex = 1 }, text = { Text("Payments") })
                Tab(selected = selectedTabIndex == 2, onClick = { selectedTabIndex = 2 }, text = { Text("Credit Notes") })
                Tab(selected = selectedTabIndex == 3, onClick = { selectedTabIndex = 3 }, text = { Text("Orders") })
            }

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                placeholder = { Text("Search history...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            val marqueeEnabled = billingViewModel.sessionManager.marqueeEnabled
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 80.dp)
            ) {
                when (selectedTabIndex) {
                    0 -> items(filteredBills) { bill ->
                        HistoryCard(
                            title = bill.billNumber.ifEmpty { "INV-${bill.id.takeLast(6)}" },
                            subtitle = bill.customerName.ifBlank { "Customer" },
                            amount = "₹${bill.grandTotal}",
                            date = bill.date,
                            info = "${bill.items.size} item(s) • ${bill.paymentMode}",
                            marqueeEnabled = marqueeEnabled
                        )
                    }
                    1 -> items(filteredPayments) { payment ->
                        HistoryCard(
                            title = payment.referenceNo ?: "Payment",
                            subtitle = payment.safeCustomerName,
                            amount = "₹${payment.effectiveAmount}",
                            date = payment.safePaymentDate,
                            info = "${payment.safeType} • ${payment.safePaymentMedium}",
                            marqueeEnabled = marqueeEnabled
                        )
                    }
                    2 -> items(filteredCreditNotes) { credit ->
                        HistoryCard(
                            title = credit.referenceNo ?: "Credit Note",
                            subtitle = credit.safeCustomerName,
                            amount = "₹${credit.effectiveAmount}",
                            date = credit.safePaymentDate,
                            info = "${credit.safeType} • Credit Note",
                            marqueeEnabled = marqueeEnabled
                        )
                    }
                    3 -> items(filteredOrders) { order ->
                        HistoryCard(
                            title = order.orderNumber.ifEmpty { "ORD-${order.id.takeLast(6)}" },
                            subtitle = order.customerName.ifBlank { "Customer" },
                            amount = "₹${order.totalAmount}",
                            date = order.orderDate,
                            info = "Stage: ${order.currentStage} • Status: ${order.status}",
                            marqueeEnabled = marqueeEnabled
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HistoryCard(
    title: String,
    subtitle: String,
    amount: String,
    date: String,
    info: String,
    marqueeEnabled: Boolean
) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
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
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = info,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
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
