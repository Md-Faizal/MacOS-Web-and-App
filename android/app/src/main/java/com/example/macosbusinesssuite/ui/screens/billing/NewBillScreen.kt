package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Person
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
import com.example.macosbusinesssuite.domain.calculation.BillCalculator
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewBillScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    val contacts by billingViewModel.contacts.collectAsState()
    val products by billingViewModel.products.collectAsState()
    val isLoading by billingViewModel.isLoading.collectAsState()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    var selectedCustomer by remember { mutableStateOf<Contact?>(null) }
    var customerName by remember { mutableStateOf("") }
    var showCustomerPicker by remember { mutableStateOf(false) }
    var showAddProductDialog by remember { mutableStateOf(false) }

    // Line items input state
    var rawItems by remember { mutableStateOf(listOf<CalculateBillItemRequest>()) }
    var serverCalcResult by remember { mutableStateOf<CalculateBillResponse?>(null) }
    var isServerSyncing by remember { mutableStateOf(false) }

    // 1. Instant Client-Side Calculation (0ms latency - updates UI immediately as items are added/deleted)
    LaunchedEffect(rawItems, selectedCustomer) {
        if (rawItems.isNotEmpty()) {
            val instant = BillCalculator.calculate(
                items = rawItems,
                customer = selectedCustomer,
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

    // 2. Debounced Background Server Verification (pulls exact DB statement running balance)
    LaunchedEffect(rawItems, customerName, selectedCustomer) {
        if (rawItems.isNotEmpty()) {
            delay(200)
            isServerSyncing = true
            val calcReq = CalculateBillRequest(
                customerId = selectedCustomer?.id,
                customerName = customerName.ifEmpty { null },
                items = rawItems,
                roundOffEnabled = true
            )
            billingViewModel.calculateBill(calcReq) { resp ->
                if (resp != null && resp.success) {
                    serverCalcResult = resp
                }
                isServerSyncing = false
            }
        } else {
            isServerSyncing = false
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("New Bill", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp).padding(end = 16.dp), strokeWidth = 2.dp)
                    } else {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.padding(end = 8.dp)
                        ) {
                            OutlinedButton(
                                onClick = {
                                    val resolvedCustId = selectedCustomer?.id ?: contacts.find { it.name.equals(customerName, true) }?.id
                                    if (resolvedCustId.isNullOrBlank()) {
                                        scope.launch {
                                            snackbarHostState.showSnackbar("Please select a registered customer to save a draft order")
                                        }
                                        return@OutlinedButton
                                    }
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
                                    val grandTotal = serverCalcResult?.summary?.grandTotal ?: orderItems.sumOf { it.amount }
                                    val req = CreateOrderRequest(
                                        customerId = resolvedCustId,
                                        currentStage = "stage1",
                                        orderNotes = "Draft saved from New Bill screen",
                                        totalAmount = grandTotal,
                                        items = orderItems
                                    )
                                    billingViewModel.createOrder(req) { success, msg ->
                                        if (success) {
                                            navController.navigateUp()
                                        } else {
                                            scope.launch {
                                                snackbarHostState.showSnackbar(msg ?: "Failed to save draft order")
                                            }
                                        }
                                    }
                                },
                                enabled = customerName.isNotBlank() && rawItems.isNotEmpty() && !isLoading,
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("Save Draft")
                            }

                            Button(
                                onClick = {
                                    val billItems = (serverCalcResult?.items ?: emptyList()).map { item ->
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
                                    }
                                    val req = CreateBillRequest(
                                        customerId = selectedCustomer?.id,
                                        customerName = customerName.ifEmpty { "Walk-in Customer" },
                                        customerPhone = selectedCustomer?.phone,
                                        items = billItems,
                                        subtotal = serverCalcResult?.summary?.subtotal ?: 0.0,
                                        discountTotal = serverCalcResult?.summary?.totalDiscount ?: 0.0,
                                        taxTotal = serverCalcResult?.summary?.totalGst ?: 0.0,
                                        roundOff = serverCalcResult?.summary?.roundOff ?: 0.0,
                                        grandTotal = serverCalcResult?.summary?.grandTotal ?: 0.0,
                                        paidAmount = 0.0,
                                        paymentMode = "Cash"
                                    )
                                    billingViewModel.createBill(req) { success, msg ->
                                        if (success) {
                                            navController.navigateUp()
                                        } else {
                                            scope.launch {
                                                snackbarHostState.showSnackbar(msg ?: "Failed to save bill")
                                            }
                                        }
                                    }
                                },
                                enabled = customerName.isNotBlank() && rawItems.isNotEmpty() && !isLoading,
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("Save Bill", fontWeight = FontWeight.Bold)
                            }
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
            // Customer Info Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Customer Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        TextButton(onClick = { showCustomerPicker = true }) {
                            Icon(Icons.Default.Person, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Pick Contact")
                        }
                    }

                    OutlinedTextField(
                        value = customerName,
                        onValueChange = {
                            customerName = it
                            selectedCustomer = null // reset picked ID if manually typed
                        },
                        label = { Text("Customer Name / Store") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )

                    // Customer balance badge if available
                    val prevDue = serverCalcResult?.previousDue ?: selectedCustomer?.openingBalance
                    if (prevDue != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (prevDue > 0) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer
                        ) {
                            Text(
                                text = "Previous Due: ₹$prevDue",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                color = if (prevDue > 0) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }
            }

            // Products Section Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Products (${rawItems.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (isServerSyncing) {
                    Text("Syncing...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
            }

            // Items List
            if (rawItems.isEmpty()) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "No products added yet.\nClick + below to add an item.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val displayItems = serverCalcResult?.items
                    itemsIndexed(rawItems) { index, rawItem ->
                        val calcItem = displayItems?.getOrNull(index)
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        calcItem?.productName ?: rawItem.productName ?: "Item",
                                        fontWeight = FontWeight.Bold,
                                        style = MaterialTheme.typography.titleSmall
                                    )
                                    val r = calcItem?.rate ?: rawItem.rate
                                    val q = calcItem?.qty ?: rawItem.qty
                                    val amt = calcItem?.amount ?: (r * q)
                                    Text("Qty: $q × ₹$r = ₹$amt", style = MaterialTheme.typography.bodySmall)

                                    val d1 = calcItem?.discount1Percent ?: rawItem.disc1
                                    val d2 = calcItem?.discount2Percent ?: rawItem.disc2
                                    if (d1 > 0 || d2 > 0) {
                                        Text("Discounts: $d1% / $d2%", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                    }

                                    val gst = calcItem?.gstPercent ?: rawItem.gstPercent
                                    if (gst > 0) {
                                        Text("GST: $gst% (₹${calcItem?.gstAmount ?: 0.0})", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                                    }

                                    val free = calcItem?.free ?: 0
                                    if (free > 0) {
                                        Surface(
                                            shape = RoundedCornerShape(4.dp),
                                            color = MaterialTheme.colorScheme.secondaryContainer,
                                            modifier = Modifier.padding(top = 2.dp)
                                        ) {
                                            Text("+$free Free (${rawItem.scheme})", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                                        }
                                    }

                                    if (rawItem.gstReverse) {
                                        Text("Reverse GST applied (-4.77%)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                                    }
                                }

                                Column(horizontalAlignment = Alignment.End) {
                                    val finalAmt = calcItem?.finalAmount ?: (rawItem.rate * rawItem.qty)
                                    Text("₹$finalAmt", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                    IconButton(onClick = {
                                        rawItems = rawItems.toMutableList().also { it.removeAt(index) }
                                    }) {
                                        Icon(Icons.Default.Delete, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Summary Footer
            val summary = serverCalcResult?.summary
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Subtotal", style = MaterialTheme.typography.bodyMedium)
                        Text("₹${summary?.subtotal ?: 0.0}", style = MaterialTheme.typography.bodyMedium)
                    }
                    if ((summary?.totalDiscount ?: 0.0) > 0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total Discount", style = MaterialTheme.typography.bodyMedium)
                            Text("-₹${summary?.totalDiscount ?: 0.0}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if ((summary?.totalGst ?: 0.0) > 0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total GST", style = MaterialTheme.typography.bodyMedium)
                            Text("+₹${summary?.totalGst ?: 0.0}", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    if ((summary?.roundOff ?: 0.0) != 0.0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Round Off", style = MaterialTheme.typography.bodySmall)
                            Text("₹${summary?.roundOff ?: 0.0}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.2f))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Grand Total", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("₹${summary?.grandTotal ?: 0.0}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    if ((serverCalcResult?.previousDue ?: 0.0) > 0) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Projected Balance Due", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            Text("₹${serverCalcResult?.projectedDue ?: 0.0}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                        }
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
                customerName = contact.name
                showCustomerPicker = false
            }
        )
    }

    if (showAddProductDialog) {
        AddProductDialog(
            products = products,
            onDismiss = { showAddProductDialog = false },
            onAdd = { _, itemReq ->
                rawItems = rawItems + itemReq
                showAddProductDialog = false
            }
        )
    }
}
