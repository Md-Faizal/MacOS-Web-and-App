package com.example.macosbusinesssuite.ui.screens.billing

import com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.*

enum class PaymentSubPage(val title: String, val icon: ImageVector) {
    PAYMENT("Payment", Icons.Default.Payment),
    CREDIT_NOTE("Credit", Icons.AutoMirrored.Filled.ReceiptLong), // Shortened text to fix alignment
    HISTORY("History", Icons.Default.History)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentsCreditNoteScreen(
    navController: NavController,
    billingViewModel: BillingViewModel,
    initialType: String = "Payment"
) {
    val context = LocalContext.current
    val bills by billingViewModel.bills.collectAsState()
    val payments by billingViewModel.payments.collectAsState()
    val contacts by billingViewModel.contacts.collectAsState()
    val metrics by billingViewModel.dashboardMetrics.collectAsState()
    val isLoading by billingViewModel.isLoading.collectAsState()

    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    val (initialTab, prefilledCustomer) = remember(initialType) {
        when {
            initialType.equals("Credit Note", ignoreCase = true) || initialType.equals("credit-note", ignoreCase = true) -> Pair(PaymentSubPage.CREDIT_NOTE, "")
            initialType.equals("History", ignoreCase = true) || initialType.equals("transaction-history", ignoreCase = true) -> Pair(PaymentSubPage.HISTORY, "")
            initialType.equals("Payment", ignoreCase = true) || initialType.equals("payment", ignoreCase = true) -> Pair(PaymentSubPage.PAYMENT, "")
            else -> Pair(PaymentSubPage.PAYMENT, initialType)
        }
    }

    var selectedTab by remember { mutableStateOf(initialTab) }

    val customerNames = remember(bills, contacts) {
        val set = mutableSetOf<String>()
        bills.forEach { if (it.customerName.isNotBlank()) set.add(it.customerName) }
        contacts.forEach { if (it.name.isNotBlank() && it.openingBalance != 0.0) set.add(it.name) }
        set.sorted()
    }

    val displayCollected = metrics.totalPaid
    val displayPending = metrics.amountDue
    val partialBillsCount = remember(bills, contacts) {
        val excludedCustomerNames = contacts.filter { it.excludeFromStats == 1 }.map { it.name }.toSet()
        bills.count { it.status.equals("partial", ignoreCase = true) && !excludedCustomerNames.contains(it.customerName) }
    }

    Scaffold(
        snackbarHost = {
            Box(modifier = Modifier.fillMaxSize()) {
                SnackbarHost(
                    hostState = snackbarHostState,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp).wrapContentSize()
                ) { data ->
                    // Animated Material 3 Pill Snackbar
                    Snackbar(
                        snackbarData = data,
                        containerColor = MaterialTheme.colorScheme.inverseSurface,
                        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
                        shape = CircleShape,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = innerPadding.calculateBottomPadding())
                .background(MaterialTheme.colorScheme.background)
        ) {
            // M3 Top Floating Box with Navigation & Page Selector
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                shape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp),
                shadowElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(bottom = 8.dp, start = 16.dp, end = 16.dp, top = 4.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { navController.navigateUp() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                        
                        // Pill-style Page Selector moved next to back button
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .padding(start = 4.dp, end = 16.dp)
                                .background(MaterialTheme.colorScheme.surface, CircleShape)
                                .padding(4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                        PaymentSubPage.values().forEach { subPage ->
                            val isSelected = selectedTab == subPage
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(CircleShape)
                                    .background(if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                                    .clickable { selectedTab = subPage }
                                    .padding(vertical = 8.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Icon(
                                        imageVector = subPage.icon,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                        tint = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    AnimatedVisibility(
                                        visible = isSelected,
                                        enter = fadeIn() + expandHorizontally(),
                                        exit = fadeOut() + shrinkHorizontally()
                                    ) {
                                        Text(
                                            text = subPage.title,
                                            style = MaterialTheme.typography.labelMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Restored Top Header Stats
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                HeaderStatCard(
                    title = "Pending",
                    value = "₹${formatCurrency(displayPending)}",
                    icon = Icons.Default.HourglassBottom,
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.weight(1f)
                )
                HeaderStatCard(
                    title = "Partial Bills",
                    value = "$partialBillsCount",
                    icon = Icons.Default.Receipt,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.weight(1f)
                )
                HeaderStatCard(
                    title = "Collected",
                    value = "₹${formatCurrency(displayCollected)}",
                    icon = Icons.Default.AccountBalanceWallet,
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.weight(1f)
                )
            }

            if (isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            // Tab Content
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp)
            ) {
                when (selectedTab) {
                    PaymentSubPage.PAYMENT -> RecordPaymentTab(
                        customerNames = customerNames,
                        prefilledCustomer = prefilledCustomer,
                        contacts = contacts,
                        bills = bills,
                        payments = payments,
                        billingViewModel = billingViewModel,
                        onSuccess = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
                    )
                    PaymentSubPage.CREDIT_NOTE -> IssueCreditNoteTab(
                        customerNames = customerNames,
                        prefilledCustomer = prefilledCustomer,
                        contacts = contacts,
                        bills = bills,
                        payments = payments,
                        billingViewModel = billingViewModel,
                        context = context,
                        onSuccess = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
                    )
                    PaymentSubPage.HISTORY -> TransactionHistoryTab(
                        bills = bills,
                        payments = payments,
                        contacts = contacts
                    )
                }
            }
        }
    }
}

@Composable
private fun HeaderStatCard(
    title: String,
    value: String,
    icon: ImageVector,
    color: Color,
    contentColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = color,
        contentColor = contentColor
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            horizontalAlignment = Alignment.Start
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = contentColor.copy(alpha = 0.8f))
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(title, style = MaterialTheme.typography.labelSmall, fontSize = 9.sp, color = contentColor.copy(alpha = 0.7f))
        }
    }
}

// ==================== DATE PICKER COMPONENT ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier
) {
    var showDialog by remember { mutableStateOf(false) }
    val datePickerState = rememberDatePickerState()

    Box(modifier = modifier.clickable { showDialog = true }) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            label = { Text(label) },
            readOnly = true,
            enabled = false, // Prevents typing, allows Box click to intercept
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            trailingIcon = { Icon(Icons.Default.CalendarToday, contentDescription = "Select Date", tint = MaterialTheme.colorScheme.primary) },
            colors = OutlinedTextFieldDefaults.colors(
                disabledTextColor = MaterialTheme.colorScheme.onSurface,
                disabledBorderColor = MaterialTheme.colorScheme.outline,
                disabledTrailingIconColor = MaterialTheme.colorScheme.primary,
                disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                disabledContainerColor = MaterialTheme.colorScheme.surface
            )
        )
    }

    if (showDialog) {
        DatePickerDialog(
            onDismissRequest = { showDialog = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let {
                        val sdf = SimpleDateFormat("dd-MM-yyyy", Locale.US)
                        onValueChange(sdf.format(Date(it)))
                    }
                    showDialog = false
                }) { Text("OK") }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

// ==================== CUSTOMER BALANCE SUMMARY CARD ====================
@Composable
fun CustomerBalanceCard(
    customerName: String,
    totalDue: Double,
    invoicedAmount: Double,
    openingBalance: Double,
    outstandingBillsCount: Int,
    totalBillsCount: Int
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Total Due", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("₹${formatCurrency(totalDue)}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                }
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(Icons.Default.Receipt, contentDescription = null, modifier = Modifier.size(14.dp))
                        Text(
                            text = "$outstandingBillsCount Bills",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            if (openingBalance != 0.0) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Invoices: ₹${formatCurrency(invoicedAmount)}", style = MaterialTheme.typography.bodySmall)
                    Text(
                        text = if (openingBalance > 0) "+ ₹${formatCurrency(openingBalance)} (Opening)" else "- ₹${formatCurrency(Math.abs(openingBalance))} (Credit)",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = if (openingBalance > 0) MaterialTheme.colorScheme.error else Color(0xFF16A34A)
                    )
                }
            }

            val progressRatio = if (totalBillsCount > 0) ((totalBillsCount - outstandingBillsCount).toFloat() / totalBillsCount).coerceIn(0f, 1f) else 1f
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                LinearProgressIndicator(
                    progress = { progressRatio },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .clip(CircleShape),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Settlement Progress", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${(progressRatio * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                }
            }

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.secondary)
                Text("Payment will settle bills in order of priority", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ==================== TAB 1: RECORD PAYMENT ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecordPaymentTab(
    customerNames: List<String>,
    prefilledCustomer: String,
    contacts: List<Contact>,
    bills: List<Bill>,
    payments: List<PaymentRecord>,
    billingViewModel: BillingViewModel,
    onSuccess: (String) -> Unit
) {
    var selectedCustomer by remember { mutableStateOf(prefilledCustomer) }
    var customerDropdownExpanded by remember { mutableStateOf(false) }
    var apiOutstandingData by remember { mutableStateOf<CustomerOutstandingResponse?>(null) }

    var paymentAmount by remember { mutableStateOf("") }
    var selectedMethod by remember { mutableStateOf("cash") }
    var methodDropdownExpanded by remember { mutableStateOf(false) }
    var paymentDate by remember { mutableStateOf(getTodayDateString()) }
    var referenceNumber by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    val localCustomerBalance = remember(selectedCustomer, bills, payments, contacts) {
        if (selectedCustomer.isBlank()) null
        else {
            val custBills = bills.filter { it.customerName.equals(selectedCustomer, ignoreCase = true) }
            val custPayments = payments.filter { it.safeCustomerName.equals(selectedCustomer, ignoreCase = true) }
            val contact = contacts.find { it.name.equals(selectedCustomer, ignoreCase = true) }

            val invoiced = custBills.sumOf { it.grandTotal }
            val opening = contact?.openingBalance ?: 0.0
            val paid = custPayments.sumOf { it.effectiveAmount }
            val due = Math.max(0.0, invoiced + opening - paid)

            val unpaidCount = custBills.count { b ->
                val bPaid = custPayments.filter { p -> p.safeType.contains("PAYMENT", true) && (p.referenceNo == b.billNumber || p.customerId == b.customerId) }.sumOf { it.amount }
                (b.grandTotal - bPaid) > 0.01
            }

            TupleBalance(due, invoiced, opening, if (unpaidCount > 0) unpaidCount else custBills.size, Math.max(1, custBills.size))
        }
    }

    LaunchedEffect(selectedCustomer) {
        if (selectedCustomer.isNotBlank()) {
            billingViewModel.fetchCustomerOutstanding(selectedCustomer) { res ->
                apiOutstandingData = res
            }
        } else {
            apiOutstandingData = null
        }
    }

    val methodOptions = listOf(
        "cash" to "💵 Cash",
        "cheque" to "🏦 Cheque",
        "bank-transfer" to "🏧 Bank Transfer",
        "online" to "💻 Online Payment",
        "upi" to "📱 UPI",
        "card" to "💳 Card",
        "other" to "📝 Other"
    )

    val activeDue = apiOutstandingData?.totalOutstanding ?: localCustomerBalance?.totalDue ?: 0.0

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(bottom = 120.dp)
    ) {
        item {
            ExposedDropdownMenuBox(
                expanded = customerDropdownExpanded,
                onExpandedChange = { customerDropdownExpanded = !customerDropdownExpanded }
            ) {
                OutlinedTextField(
                    value = selectedCustomer.ifEmpty { "-- Choose a customer --" },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Select Customer *") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = customerDropdownExpanded) },
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface
                    )
                )
                ExposedDropdownMenu(
                    expanded = customerDropdownExpanded,
                    onDismissRequest = { customerDropdownExpanded = false },
                    modifier = Modifier.background(MaterialTheme.colorScheme.surfaceContainer)
                ) {
                    customerNames.forEach { name ->
                        DropdownMenuItem(
                            text = { Text(name, fontWeight = FontWeight.Medium) },
                            onClick = {
                                selectedCustomer = name
                                customerDropdownExpanded = false
                            }
                        )
                    }
                }
            }
        }

        if (selectedCustomer.isNotBlank()) {
            item {
                val dueVal = apiOutstandingData?.totalOutstanding ?: localCustomerBalance?.totalDue ?: 0.0
                val invVal = apiOutstandingData?.totalInvoiced ?: localCustomerBalance?.invoicedAmount ?: 0.0
                val openVal = apiOutstandingData?.openingBalance ?: localCustomerBalance?.openingBalance ?: 0.0
                val outCount = apiOutstandingData?.outstandingBillsCount ?: localCustomerBalance?.outstandingBillsCount ?: 0
                val totCount = apiOutstandingData?.totalBills ?: localCustomerBalance?.totalBillsCount ?: 1

                CustomerBalanceCard(selectedCustomer, dueVal, invVal, openVal, outCount, totCount)
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
            ) {
                Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("Payment Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = paymentAmount,
                            onValueChange = { paymentAmount = it },
                            label = { Text("Amount (₹) *") },
                            placeholder = { Text("Max: ₹${formatCurrency(activeDue)}") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            leadingIcon = {
                                Box(modifier = Modifier.padding(start = 16.dp, end = 8.dp), contentAlignment = Alignment.Center) {
                                    Text("₹", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                }
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(16.dp),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface
                            )
                        )
                        FilledTonalButton(
                            onClick = { paymentAmount = String.format(Locale.US, "%.2f", activeDue) },
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.height(56.dp),
                            contentPadding = PaddingValues(horizontal = 16.dp),
                            enabled = selectedCustomer.isNotBlank() && activeDue > 0
                        ) {
                            Text("Pay Full", fontWeight = FontWeight.Bold)
                        }
                    }

                    ExposedDropdownMenuBox(
                        expanded = methodDropdownExpanded,
                        onExpandedChange = { methodDropdownExpanded = !methodDropdownExpanded }
                    ) {
                        OutlinedTextField(
                            value = methodOptions.find { it.first == selectedMethod }?.second ?: "💵 Cash",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Payment Method *") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = methodDropdownExpanded) },
                            modifier = Modifier.menuAnchor().fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface
                            )
                        )
                        ExposedDropdownMenu(
                            expanded = methodDropdownExpanded,
                            onDismissRequest = { methodDropdownExpanded = false },
                            modifier = Modifier.background(MaterialTheme.colorScheme.surfaceContainer)
                        ) {
                            methodOptions.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.second, fontWeight = FontWeight.Medium) },
                                    onClick = { selectedMethod = option.first; methodDropdownExpanded = false }
                                )
                            }
                        }
                    }

                    // Symmetrical Date & Reference Fields
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        DatePickerField(
                            value = paymentDate,
                            onValueChange = { paymentDate = it },
                            label = "Date *",
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = referenceNumber,
                            onValueChange = { referenceNumber = it },
                            label = { Text("Reference") },
                            placeholder = { Text("Auto-generated") },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(16.dp),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface
                            )
                        )
                    }

                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Notes (Optional)") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        maxLines = 3,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )
                }
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Button(
                    onClick = {
                        val amountVal = paymentAmount.toDoubleOrNull() ?: 0.0
                        if (selectedCustomer.isBlank()) { onSuccess("❌ Please select a customer first"); return@Button }
                        if (amountVal <= 0.0) { onSuccess("❌ Please enter a valid payment amount"); return@Button }

                        val contact = contacts.find { it.name.equals(selectedCustomer, ignoreCase = true) }
                        val cId = contact?.id ?: bills.find { it.customerName.equals(selectedCustomer, ignoreCase = true) }?.customerId
                        if (cId == null) { onSuccess("❌ Customer ID not found"); return@Button }

                        val dateForApi = try {
                            val inFmt = SimpleDateFormat("dd-MM-yyyy", Locale.US)
                            val outFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                            outFmt.format(inFmt.parse(paymentDate)!!)
                        } catch (e: Exception) { paymentDate }

                        val req = RecordPaymentRequest(
                            customerId = cId,
                            amount = amountVal,
                            paymentMedium = selectedMethod,
                            referenceNumber = referenceNumber.trim().ifEmpty { null },
                            paymentDate = dateForApi,
                            notes = notes.ifBlank { null }
                        )

                        billingViewModel.recordPayment(req) { success, msg ->
                            if (success) {
                                onSuccess(msg ?: "✓ Payment recorded successfully")
                                paymentAmount = ""; notes = ""; referenceNumber = ""
                            } else { onSuccess(msg ?: "❌ Error recording payment") }
                        }
                    },
                    modifier = Modifier.weight(1f).height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Icon(Icons.Default.Check, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Record Payment", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }

                OutlinedButton(
                    onClick = {
                        selectedCustomer = ""
                        paymentAmount = ""
                        referenceNumber = ""
                        notes = ""
                        apiOutstandingData = null
                    },
                    modifier = Modifier.weight(0.4f).height(56.dp),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text("Clear")
                }
            }
        }
    }
}

// ==================== TAB 2: ISSUE CREDIT NOTE ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun IssueCreditNoteTab(
    customerNames: List<String>,
    prefilledCustomer: String,
    contacts: List<Contact>,
    bills: List<Bill>,
    payments: List<PaymentRecord>,
    billingViewModel: BillingViewModel,
    context: Context,
    onSuccess: (String) -> Unit
) {
    var selectedCustomer by remember { mutableStateOf(prefilledCustomer) }
    var customerDropdownExpanded by remember { mutableStateOf(false) }
    var apiOutstandingData by remember { mutableStateOf<CustomerOutstandingResponse?>(null) }

    var creditAmount by remember { mutableStateOf("") }
    var selectedReason by remember { mutableStateOf("") }
    var reasonDropdownExpanded by remember { mutableStateOf(false) }
    var creditDate by remember { mutableStateOf(getTodayDateString()) }
    var referenceNumber by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var imageUri by remember { mutableStateOf<Uri?>(null) }
    var compressedBase64 by remember { mutableStateOf<String?>(null) }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        imageUri = uri
        uri?.let { compressedBase64 = compressImageToBase64(context, it) }
    }

    val localCustomerBalance = remember(selectedCustomer, bills, payments, contacts) {
        if (selectedCustomer.isBlank()) null
        else {
            val custBills = bills.filter { it.customerName.equals(selectedCustomer, ignoreCase = true) }
            val custPayments = payments.filter { it.safeCustomerName.equals(selectedCustomer, ignoreCase = true) }
            val contact = contacts.find { it.name.equals(selectedCustomer, ignoreCase = true) }

            val invoiced = custBills.sumOf { it.grandTotal }
            val opening = contact?.openingBalance ?: 0.0
            val paid = custPayments.sumOf { it.effectiveAmount }
            val due = Math.max(0.0, invoiced + opening - paid)

            val unpaidCount = custBills.count { b ->
                val bPaid = custPayments.filter { p -> p.safeType.contains("PAYMENT", true) && (p.referenceNo == b.billNumber || p.customerId == b.customerId) }.sumOf { it.amount }
                (b.grandTotal - bPaid) > 0.01
            }

            TupleBalance(due, invoiced, opening, if (unpaidCount > 0) unpaidCount else custBills.size, Math.max(1, custBills.size))
        }
    }

    LaunchedEffect(selectedCustomer) {
        if (selectedCustomer.isNotBlank()) {
            billingViewModel.fetchCustomerOutstanding(selectedCustomer) { res -> apiOutstandingData = res }
        } else { apiOutstandingData = null }
    }

    val reasonOptions = listOf(
        "overpayment" to "↩️ Overpayment",
        "product-return" to "📦 Product Return",
        "discount" to "🏷️ Discount",
        "damage" to "⚠️ Damaged",
        "billing-error" to "❌ Billing Error",
        "other" to "📝 Other"
    )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(bottom = 120.dp)
    ) {
        item {
            ExposedDropdownMenuBox(
                expanded = customerDropdownExpanded,
                onExpandedChange = { customerDropdownExpanded = !customerDropdownExpanded }
            ) {
                OutlinedTextField(
                    value = selectedCustomer.ifEmpty { "-- Choose a customer --" },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Customer *") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = customerDropdownExpanded) },
                    modifier = Modifier.menuAnchor().fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )
                ExposedDropdownMenu(
                    expanded = customerDropdownExpanded,
                    onDismissRequest = { customerDropdownExpanded = false }
                ) {
                    customerNames.forEach { name ->
                        DropdownMenuItem(text = { Text(name) }, onClick = { selectedCustomer = name; customerDropdownExpanded = false })
                    }
                }
            }
        }

        if (selectedCustomer.isNotBlank()) {
            item {
                val dueVal = apiOutstandingData?.totalOutstanding ?: localCustomerBalance?.totalDue ?: 0.0
                val invVal = apiOutstandingData?.totalInvoiced ?: localCustomerBalance?.invoicedAmount ?: 0.0
                val openVal = apiOutstandingData?.openingBalance ?: localCustomerBalance?.openingBalance ?: 0.0
                val outCount = apiOutstandingData?.outstandingBillsCount ?: localCustomerBalance?.outstandingBillsCount ?: 0
                val totCount = apiOutstandingData?.totalBills ?: localCustomerBalance?.totalBillsCount ?: 1

                CustomerBalanceCard(selectedCustomer, dueVal, invVal, openVal, outCount, totCount)
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
            ) {
                Column(modifier = Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("Credit Details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)

                    OutlinedTextField(
                        value = creditAmount,
                        onValueChange = { creditAmount = it },
                        label = { Text("Credit Amount (₹) *") },
                        leadingIcon = {
                            Box(modifier = Modifier.padding(start = 16.dp, end = 8.dp), contentAlignment = Alignment.Center) {
                                Text("₹", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )

                    ExposedDropdownMenuBox(
                        expanded = reasonDropdownExpanded,
                        onExpandedChange = { reasonDropdownExpanded = !reasonDropdownExpanded }
                    ) {
                        OutlinedTextField(
                            value = reasonOptions.find { it.first == selectedReason }?.second ?: "-- Select reason --",
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Reason *") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = reasonDropdownExpanded) },
                            modifier = Modifier.menuAnchor().fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface
                            )
                        )
                        ExposedDropdownMenu(
                            expanded = reasonDropdownExpanded,
                            onDismissRequest = { reasonDropdownExpanded = false },
                            modifier = Modifier.background(MaterialTheme.colorScheme.surfaceContainer)
                        ) {
                            reasonOptions.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.second, fontWeight = FontWeight.Medium) },
                                    onClick = { selectedReason = option.first; reasonDropdownExpanded = false }
                                )
                            }
                        }
                    }

                    // Symmetrical Date & Reference Fields
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        DatePickerField(
                            value = creditDate,
                            onValueChange = { creditDate = it },
                            label = "Date *",
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = referenceNumber,
                            onValueChange = { referenceNumber = it },
                            label = { Text("Reference") },
                            placeholder = { Text("Auto-generated") },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(16.dp),
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface
                            )
                        )
                    }

                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("Description") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        maxLines = 3,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surface,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )

                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth().clickable { imagePickerLauncher.launch("image/*") }
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp).fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer) {
                                    Icon(Icons.Default.AttachFile, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.padding(10.dp))
                                }
                                Spacer(modifier = Modifier.width(16.dp))
                                Column {
                                    Text(if (imageUri != null) "Attachment Selected" else "Attach Proof", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                                    Text("JPG, PNG, WEBP max 5MB", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            if (imageUri != null) {
                                IconButton(onClick = { imageUri = null; compressedBase64 = null }) {
                                    Icon(Icons.Default.Close, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error)
                                }
                            } else { 
                                Icon(Icons.Default.AddCircleOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary) 
                            }
                        }
                    }
                    if (imageUri != null) {
                        Box(modifier = Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(16.dp))) {
                            val bitmap = remember(imageUri) {
                                try { BitmapFactory.decodeStream(context.contentResolver.openInputStream(imageUri!!)) } catch (e: Exception) { null }
                            }
                            bitmap?.let { Image(bitmap = it.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                        }
                    }
                }
            }
        }

        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = {
                        val amountVal = creditAmount.toDoubleOrNull() ?: 0.0
                        if (selectedCustomer.isBlank()) { onSuccess("❌ Please select a customer"); return@Button }
                        if (amountVal <= 0.0) { onSuccess("❌ Please enter a valid amount"); return@Button }
                        if (selectedReason.isBlank()) { onSuccess("❌ Please select a reason"); return@Button }

                        val contact = contacts.find { it.name.equals(selectedCustomer, ignoreCase = true) }
                        val cId = contact?.id ?: bills.find { it.customerName.equals(selectedCustomer, ignoreCase = true) }?.customerId
                        if (cId == null) { onSuccess("❌ Customer not found"); return@Button }

                        val dateForApi = try {
                            val inFmt = SimpleDateFormat("dd-MM-yyyy", Locale.US)
                            val outFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                            outFmt.format(inFmt.parse(creditDate)!!)
                        } catch (e: Exception) { creditDate }

                        val req = RecordCreditNoteRequest(
                            customerId = cId,
                            amount = amountVal,
                            reason = selectedReason,
                            paymentDate = dateForApi,
                            referenceNumber = referenceNumber.trim().ifEmpty { null },
                            notes = description.ifBlank { null },
                            attachmentData = compressedBase64
                        )
                        billingViewModel.recordCreditNote(req) { success, msg ->
                            if (success) {
                                onSuccess(msg ?: "✓ Credit note issued successfully")
                                creditAmount = ""; description = ""; referenceNumber = ""; imageUri = null; compressedBase64 = null
                            } else { onSuccess(msg ?: "❌ Error issuing credit note") }
                        }
                    },
                    modifier = Modifier.weight(1f).height(56.dp),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD97706))
                ) {
                    Icon(Icons.AutoMirrored.Filled.ReceiptLong, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Issue Credit Note", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color.White)
                }

                OutlinedButton(
                    onClick = {
                        selectedCustomer = ""
                        creditAmount = ""
                        referenceNumber = ""
                        description = ""
                        imageUri = null
                        compressedBase64 = null
                    },
                    modifier = Modifier.weight(0.4f).height(56.dp),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text("Clear")
                }
            }
        }
    }
}

// ==================== TAB 3: TRANSACTION HISTORY ====================
data class HistoryItem(
    val typeCode: String,
    val date: Date,
    val customerName: String,
    val amount: Double,
    val reference: String
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TransactionHistoryTab(
    bills: List<Bill>,
    payments: List<PaymentRecord>,
    contacts: List<Contact>
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("all") }

    val allTransactions = remember(bills, payments, contacts) {
        val list = mutableListOf<HistoryItem>()
        bills.forEach { b ->
            val d = FifoSettlementCalculator.parseDate(b.date) ?: Date()
            val custName = b.customerName.ifBlank { contacts.find { c -> c.id == b.customerId }?.name ?: "Customer #${b.customerId ?: ""}" }
            list.add(HistoryItem("bill", d, custName, b.grandTotal, b.billNumber))
        }
        payments.forEach { p ->
            val dateStr = p.safePaymentDate
            val d = FifoSettlementCalculator.parseDate(dateStr) ?: Date()
            val isCredit = p.safeType.contains("CREDIT", true) || p.safeType.contains("CN", true)
            val type = if (isCredit) "credit_note" else "payment"
            val custName = p.safeCustomerName.ifBlank { contacts.find { c -> c.id == p.customerId }?.name ?: "Customer #${p.customerId ?: ""}" }
            val amt = p.effectiveAmount
            list.add(HistoryItem(type, d, custName, amt, p.referenceNo ?: ""))
        }
        list
    }

    val filteredTransactions = remember(allTransactions, searchQuery, selectedFilter) {
        if (selectedFilter == "opening-balance") {
            emptyList()
        } else {
            allTransactions.filter { t ->
                val matchesType = when (selectedFilter) {
                    "payment" -> t.typeCode == "payment"
                    "credit-note" -> t.typeCode == "credit_note"
                    "bill" -> t.typeCode == "bill"
                    else -> true
                }
                val q = searchQuery.trim().lowercase()
                val matchesSearch = q.isEmpty() ||
                        t.customerName.lowercase().contains(q) ||
                        t.reference.lowercase().contains(q)
                matchesType && matchesSearch
            }.sortedByDescending { it.date }
        }
    }

    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search by name or reference...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface
            )
        )

        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(horizontal = 2.dp)
        ) {
            val filters = listOf(
                "all" to "All",
                "payment" to "Payments",
                "bill" to "Bills",
                "credit-note" to "Credit Notes",
                "opening-balance" to "Opening Balances"
            )
            items(filters) { filter ->
                val isSelected = selectedFilter == filter.first
                FilterChip(
                    selected = isSelected,
                    onClick = { selectedFilter = filter.first },
                    label = { 
                        Text(
                            text = filter.second,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                        ) 
                    },
                    shape = RoundedCornerShape(16.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer
                    ),
                    leadingIcon = if (isSelected) {
                        { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                    } else null
                )
            }
        }

        if (selectedFilter == "opening-balance") {
            val contactsWithOpening = remember(contacts) { contacts.filter { it.openingBalance != 0.0 } }
            if (contactsWithOpening.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No customer opening balances recorded", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(bottom = 120.dp)) {
                    items(contactsWithOpening) { contact ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerHigh,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
                                        Icon(Icons.Default.AccountBalance, contentDescription = null, modifier = Modifier.padding(12.dp), tint = MaterialTheme.colorScheme.onSecondaryContainer)
                                    }
                                    Column {
                                        Text(contact.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                        Text("Opening Balance", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                Text(
                                    text = "₹${formatCurrency(contact.openingBalance)}",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    color = if (contact.openingBalance > 0) MaterialTheme.colorScheme.error else Color(0xFF16A34A)
                                )
                            }
                        }
                    }
                }
            }
        } else {
            if (filteredTransactions.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Inbox, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.surfaceVariant)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("No transactions found", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                    }
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(bottom = 120.dp)
                ) {
                    items(filteredTransactions) { t ->
                        val isBill = t.typeCode == "bill"
                        val isCredit = t.typeCode == "credit_note"
                        val icon = when {
                            isBill -> Icons.Default.ReceiptLong
                            isCredit -> Icons.Default.ConfirmationNumber
                            else -> Icons.Default.Payments
                        }
                        val badgeContainerColor = when {
                            isBill -> MaterialTheme.colorScheme.errorContainer
                            isCredit -> MaterialTheme.colorScheme.tertiaryContainer
                            else -> MaterialTheme.colorScheme.secondaryContainer
                        }
                        val badgeIconColor = when {
                            isBill -> MaterialTheme.colorScheme.onErrorContainer
                            isCredit -> MaterialTheme.colorScheme.onTertiaryContainer
                            else -> MaterialTheme.colorScheme.onSecondaryContainer
                        }
                        val amountColor = if (isBill) MaterialTheme.colorScheme.error else Color(0xFF16A34A)
                        val amountPrefix = if (isBill) "- ₹" else "+ ₹"
                        val typeLabel = when {
                            isBill -> "Bill Invoice"
                            isCredit -> "Credit Note"
                            else -> "Payment"
                        }
                        val sdf = SimpleDateFormat("dd MMM yyyy", Locale.US)

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                            color = MaterialTheme.colorScheme.surfaceContainerHigh,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                            shadowElevation = 1.dp
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = badgeContainerColor,
                                        modifier = Modifier.size(48.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(icon, contentDescription = null, modifier = Modifier.size(22.dp), tint = badgeIconColor)
                                        }
                                    }
                                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(
                                            text = t.customerName.ifBlank { "Unknown Customer" },
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(6.dp),
                                                color = badgeContainerColor.copy(alpha = 0.6f)
                                            ) {
                                                Text(
                                                    text = typeLabel,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = badgeIconColor,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                            if (t.reference.isNotBlank()) {
                                                Text("•", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                                                Text(t.reference, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            }
                                        }
                                        Text(sdf.format(t.date), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline, fontSize = 11.sp)
                                    }
                                }
                                Text(
                                    text = "$amountPrefix${formatCurrency(t.amount)}",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 16.sp,
                                    color = amountColor,
                                    modifier = Modifier.padding(start = 8.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}


private data class TupleBalance(
    val totalDue: Double,
    val invoicedAmount: Double,
    val openingBalance: Double,
    val outstandingBillsCount: Int,
    val totalBillsCount: Int
)

private fun getTodayDateString(): String {
    val sdf = java.text.SimpleDateFormat("dd-MM-yyyy", java.util.Locale.US)
    return sdf.format(java.util.Date())
}

private fun compressImageToBase64(context: android.content.Context, uri: android.net.Uri): String {
    val inputStream = context.contentResolver.openInputStream(uri)
    val originalBitmap = android.graphics.BitmapFactory.decodeStream(inputStream)
    val outputStream = java.io.ByteArrayOutputStream()
    originalBitmap?.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, outputStream)
    return android.util.Base64.encodeToString(outputStream.toByteArray(), android.util.Base64.NO_WRAP)
}




