package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.ui.screens.billing.components.AddProductDialog
import com.example.macosbusinesssuite.ui.screens.billing.components.CustomerPickerDialog
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewOrderScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    val contacts by billingViewModel.contacts.collectAsState()
    val products by billingViewModel.products.collectAsState()
    val isLoading by billingViewModel.isLoading.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var selectedCustomer by remember { mutableStateOf<Contact?>(null) }
    var showCustomerPicker by remember { mutableStateOf(false) }
    var showAddProductDialog by remember { mutableStateOf(false) }

    var orderNumber by remember { mutableStateOf("") }
    var orderNotes by remember { mutableStateOf("") }
    var selectedStage by remember { mutableStateOf("stage1") }

    // Line items input state
    var rawItems by remember { mutableStateOf(listOf<CalculateBillItemRequest>()) }
    var serverCalcResult by remember { mutableStateOf<CalculateBillResponse?>(null) }
    var isCalculating by remember { mutableStateOf(false) }

    // Next order number
    LaunchedEffect(Unit) {
        billingViewModel.fetchNextOrderNumber { next ->
            if (next != null) orderNumber = next
        }
    }

    // Trigger server-authoritative calculation whenever items or customer change
    LaunchedEffect(rawItems, selectedCustomer) {
        if (rawItems.isNotEmpty()) {
            isCalculating = true
            val calcReq = CalculateBillRequest(
                customerId = selectedCustomer?.id,
                customerName = selectedCustomer?.name,
                items = rawItems,
                roundOffEnabled = true
            )
            billingViewModel.calculateBill(calcReq) { resp ->
                serverCalcResult = resp
                isCalculating = false
            }
        } else {
            serverCalcResult = null
            isCalculating = false
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
                    if (isLoading || isCalculating) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp).padding(end = 16.dp), strokeWidth = 2.dp)
                    } else {
                        Button(
                            onClick = {
                                val calculatedItems = serverCalcResult?.items ?: emptyList()
                                val orderItems = if (calculatedItems.isNotEmpty()) {
                                    calculatedItems.map {
                                        OrderItemRequest(
                                            productId = it.productId ?: "",
                                            variantId = it.variantId,
                                            batchId = it.batchId,
                                            qty = it.qty,
                                            rate = it.rate,
                                            amount = it.finalAmount
                                        )
                                    }
                                } else {
                                    rawItems.map {
                                        OrderItemRequest(
                                            productId = it.productId ?: "",
                                            variantId = it.variantId,
                                            batchId = it.batchId,
                                            qty = it.qty,
                                            rate = it.rate,
                                            amount = it.qty * it.rate
                                        )
                                    }
                                }

                                val grandTotal = serverCalcResult?.summary?.grandTotal 
                                    ?: orderItems.sumOf { it.amount }

                                val request = CreateOrderRequest(
                                    customerId = selectedCustomer?.id ?: "",
                                    orderNumber = orderNumber.ifEmpty { null },
                                    currentStage = selectedStage,
                                    orderNotes = orderNotes,
                                    totalAmount = grandTotal,
                                    items = orderItems
                                )

                                billingViewModel.createOrder(request) { success, msg ->
                                    if (success) {
                                        scope.launch {
                                            snackbarHostState.showSnackbar("✓ Order created successfully")
                                        }
                                        navController.navigateUp()
                                    } else {
                                        scope.launch {
                                            snackbarHostState.showSnackbar(msg ?: "Error creating order")
                                        }
                                    }
                                }
                            },
                            enabled = selectedCustomer != null && rawItems.isNotEmpty(),
                            modifier = Modifier.padding(end = 8.dp)
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
                Icon(Icons.Default.Add, contentDescription = "Add Item")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Customer and Order Settings Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Customer & Pipeline Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedCard(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { showCustomerPicker = true },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = selectedCustomer?.name ?: "Select Customer *",
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = if (selectedCustomer != null) FontWeight.Bold else FontWeight.Normal,
                                    color = if (selectedCustomer == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface
                                )
                                if (selectedCustomer?.openingBalance != null && selectedCustomer!!.openingBalance != 0.0) {
                                    Text(
                                        "Opening Due: ₹${selectedCustomer!!.openingBalance}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
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

                    Spacer(modifier = Modifier.height(12.dp))

                    // Pipeline Stage Selector
                    Text("Initial Pipeline Stage", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val stages = listOf("stage1" to "1: Intake", "stage2" to "2: QC/Pack", "stage3" to "3: Dispatch")
                        stages.forEach { (stgKey, stgLabel) ->
                            FilterChip(
                                selected = selectedStage == stgKey,
                                onClick = { selectedStage = stgKey },
                                label = { Text(stgLabel) }
                            )
                        }
                    }
                }
            }

            // Items List Title
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Order Line Items (${rawItems.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (isCalculating) {
                    Text("Syncing with server...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            }

            // Line Items List
            if (rawItems.isEmpty()) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No items added yet.\nTap + below to add products with server calculation.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    val displayItems = serverCalcResult?.items ?: rawItems.map {
                        CalculatedServerItem(
                            productId = it.productId,
                            productName = it.productName ?: "Product",
                            variantId = it.variantId,
                            batchId = it.batchId,
                            qty = it.qty,
                            rate = it.rate,
                            amount = it.qty * it.rate,
                            discount1Percent = it.disc1,
                            discount1Amount = 0.0,
                            discount2Percent = it.disc2,
                            discount2Amount = 0.0,
                            gstPercent = it.gstPercent,
                            gstAmount = 0.0,
                            finalAmount = it.qty * it.rate
                        )
                    }

                    itemsIndexed(displayItems) { index, item ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.productName, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyLarge)
                                    Text("Qty: ${item.qty} × ₹${item.rate} = ₹${item.amount}", style = MaterialTheme.typography.bodyMedium)
                                    if (item.discount1Amount > 0 || item.discount2Amount > 0) {
                                        Text(
                                            "Discount: -₹${"%.2f".format(item.discount1Amount + item.discount2Amount)} (${item.discount1Percent}% / ${item.discount2Percent}%)",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                    if (item.gstAmount > 0) {
                                        Text(
                                            "GST (${item.gstPercent}%): +₹${"%.2f".format(item.gstAmount)}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.tertiary
                                        )
                                    }
                                    if (!item.scheme.isNullOrBlank()) {
                                        Text("Scheme: ${item.scheme}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                                    }
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("₹${"%.2f".format(item.finalAmount)}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                    IconButton(
                                        onClick = {
                                            rawItems = rawItems.filterIndexed { i, _ -> i != index }
                                        }
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Summary Footer (Powered by Server Authority)
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
            ) {
                val summary = serverCalcResult?.summary
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Subtotal", style = MaterialTheme.typography.bodyMedium)
                        Text("₹${"%.2f".format(summary?.subtotal ?: 0.0)}", style = MaterialTheme.typography.bodyMedium)
                    }
                    if ((summary?.totalDiscount ?: 0.0) > 0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total Discount", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                            Text("-₹${"%.2f".format(summary?.totalDiscount ?: 0.0)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                    if ((summary?.totalGst ?: 0.0) > 0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total GST", style = MaterialTheme.typography.bodyMedium)
                            Text("+₹${"%.2f".format(summary?.totalGst ?: 0.0)}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if ((summary?.roundOff ?: 0.0) != 0.0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Round Off", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${if ((summary?.roundOff ?: 0.0) > 0) "+" else ""}₹${"%.2f".format(summary?.roundOff ?: 0.0)}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Divider(modifier = Modifier.padding(vertical = 8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Order Estimated Total", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("₹${"%.2f".format(summary?.grandTotal ?: 0.0)}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }

    if (showCustomerPicker) {
        CustomerPickerDialog(
            contacts = contacts,
            onDismiss = { showCustomerPicker = false },
            onSelectCustomer = { contact ->
                selectedCustomer = contact
                showCustomerPicker = false
            }
        )
    }

    if (showAddProductDialog) {
        AddProductDialog(
            products = products,
            onDismiss = { showAddProductDialog = false },
            onAdd = { pName, itemReq ->
                rawItems = rawItems + itemReq.copy(productName = pName)
                showAddProductDialog = false
            }
        )
    }
}
