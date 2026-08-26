package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import com.example.macosbusinesssuite.ui.screens.billing.components.AddProductDialog
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewOrderScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    val contacts by billingViewModel.contacts.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    var selectedCustomer by remember { mutableStateOf<Contact?>(null) }
    var customerQuery by remember { mutableStateOf("") }
    var showCustomerDialog by remember { mutableStateOf(false) }
    
    var orderNumber by remember { mutableStateOf("") }
    var orderNotes by remember { mutableStateOf("") }
    
    var showAddProductDialog by remember { mutableStateOf(false) }
    
    // Line items and summary state
    var lineItems by remember { mutableStateOf(listOf<CalculatedLineItem>()) }
    var productNames by remember { mutableStateOf(mapOf<Int, String>()) } // Maps index to product name for display
    
    val summary = remember(lineItems) {
        BillCalculator.calculateBillSummary(lineItems)
    }

    LaunchedEffect(Unit) {
        billingViewModel.fetchNextOrderNumber { next ->
            if (next != null) orderNumber = next
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("New Order", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    val isLoading by billingViewModel.isLoading.collectAsState()
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                    } else {
                        TextButton(
                            onClick = {
                                val request = CreateOrderRequest(
                                    customerId = selectedCustomer?.id ?: "",
                                    orderNumber = orderNumber.ifEmpty { null },
                                    orderNotes = orderNotes,
                                    totalAmount = summary.grandTotal,
                                    items = lineItems.map { 
                                        OrderItemRequest(
                                            productId = it.productId,
                                            variantId = it.variantId,
                                            batchId = it.batchId,
                                            qty = it.qty.toDouble(),
                                            rate = it.rate,
                                            amount = it.finalAmount
                                        )
                                    }
                                )
                                billingViewModel.createOrder(request) { success, msg ->
                                    if (success) {
                                        navController.navigateUp()
                                    } else {
                                        scope.launch {
                                            snackbarHostState.showSnackbar(msg ?: "Error creating order")
                                        }
                                    }
                                }
                            },
                            enabled = selectedCustomer != null && lineItems.isNotEmpty()
                        ) {
                            Text("Save Order", fontWeight = FontWeight.Bold)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddProductDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = "Add Product")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Customer Info
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Customer Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    OutlinedCard(
                        modifier = Modifier.fillMaxWidth().clickable { showCustomerDialog = true },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = selectedCustomer?.name ?: "Select Customer",
                                style = MaterialTheme.typography.bodyLarge,
                                color = if (selectedCustomer == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedTextField(
                            value = orderNumber,
                            onValueChange = { orderNumber = it },
                            label = { Text("Order #") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )
                        OutlinedTextField(
                            value = orderNotes,
                            onValueChange = { orderNotes = it },
                            label = { Text("Notes") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp)
                        )
                    }
                }
            }

            // Line Items List
            Text(
                "Order Items",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
            )
            
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(lineItems.indices.toList()) { index ->
                    val item = lineItems[index]
                    val pName = productNames[index] ?: "Product"
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
                                Text(pName, fontWeight = FontWeight.Bold)
                                Text("Qty: ${item.qty} × ₹${item.rate} = ₹${item.amount}")
                                if (item.discount1Percent > 0 || item.discount2Percent > 0) {
                                    Text("Discounts: ${item.discount1Percent}% / ${item.discount2Percent}% (-₹${item.discount1Amount + item.discount2Amount})", color = MaterialTheme.colorScheme.primary)
                                }
                                Text("GST: ${item.gstPercent}% (₹${item.gstAmount})", color = MaterialTheme.colorScheme.tertiary)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("₹${item.finalAmount}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                IconButton(onClick = {
                                    val newList = lineItems.toMutableList()
                                    newList.removeAt(index)
                                    lineItems = newList
                                    
                                    val newNames = productNames.toMutableMap()
                                    newNames.remove(index)
                                    // Re-index names
                                    val reindexed = mutableMapOf<Int, String>()
                                    newList.forEachIndexed { i, _ ->
                                        reindexed[i] = newNames[if (i >= index) i + 1 else i] ?: "Product"
                                    }
                                    productNames = reindexed
                                }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }

            // Summary Footer
            Surface(
                color = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
            ) {
                Column(modifier = Modifier.padding(24.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Subtotal")
                        Text("₹${summary.subtotal}")
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total Discount")
                        Text("-₹${summary.totalDiscount}")
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total GST")
                        Text("+₹${summary.totalGst}")
                    }
                    Divider(modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.2f))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Estimated Total", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("₹${summary.grandTotal}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }

    if (showCustomerDialog) {
        CustomerSelectionDialog(
            contacts = contacts,
            onDismiss = { showCustomerDialog = false },
            onSelect = {
                selectedCustomer = it
                showCustomerDialog = false
            }
        )
    }

    if (showAddProductDialog) {
        AddProductDialog(
            onDismiss = { showAddProductDialog = false },
            onAdd = { pName, item ->
                lineItems = lineItems + item
                productNames = productNames + (lineItems.size - 1 to pName)
                showAddProductDialog = false
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerSelectionDialog(
    contacts: List<Contact>,
    onDismiss: () -> Unit,
    onSelect: (Contact) -> Unit
) {
    var query by remember { mutableStateOf("") }
    val filtered = remember(query, contacts) {
        contacts.filter { it.name.contains(query, ignoreCase = true) }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier.fillMaxWidth().fillMaxHeight(0.8f),
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Select Customer", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(filtered) { contact ->
                        ListItem(
                            headlineContent = { Text(contact.name) },
                            supportingContent = { Text(contact.phone ?: contact.email ?: "") },
                            modifier = Modifier.clickable { onSelect(contact) }
                        )
                    }
                }
                TextButton(onClick = onDismiss, modifier = Modifier.align(Alignment.End)) {
                    Text("Cancel")
                }
            }
        }
    }
}
