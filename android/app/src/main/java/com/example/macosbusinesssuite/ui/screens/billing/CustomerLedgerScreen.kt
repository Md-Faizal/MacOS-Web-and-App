package com.example.macosbusinesssuite.ui.screens.billing

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.Bill
import com.example.macosbusinesssuite.data.model.LedgerCustomer
import com.example.macosbusinesssuite.data.model.PaymentRecord
import com.example.macosbusinesssuite.ui.components.KpiStatCard
import com.example.macosbusinesssuite.ui.components.PixelSearchBar
import com.example.macosbusinesssuite.ui.components.PixelStatusBadge
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import com.example.macosbusinesssuite.util.DateTimeUtils
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.abs

private enum class LedgerSortOption(val label: String) {
    NAME_ASC("Name (A-Z)"),
    NAME_DESC("Name (Z-A)"),
    DUE_DESC("Amount Due"),
    OVERDUE_DESC("Days Overdue"),
    RECENT("Most Recent")
}

private enum class LedgerStatusFilter(val label: String) {
    ALL("All Customers"),
    DUE("Outstanding Due"),
    OVERDUE("Overdue"),
    CREDIT("Credit Balance"),
    CLEAR("Clear / Settled")
}

enum class DateRangeFilter(val label: String) {
    ALL("All Dates"),
    THIS_MONTH("This Month"),
    LAST_3("Last 3 Months"),
    LAST_6("Last 6 Months"),
    THIS_YEAR("This Year")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerLedgerScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    val context = LocalContext.current
    val ledgerCustomers by billingViewModel.ledgerCustomers.collectAsState()
    val bills by billingViewModel.bills.collectAsState()
    val payments by billingViewModel.payments.collectAsState()
    val isLoading by billingViewModel.isLoading.collectAsState()

    var searchQuery by rememberSaveable { mutableStateOf("") }
    var selectedSort by rememberSaveable { mutableStateOf(LedgerSortOption.DUE_DESC) }
    var selectedStatusFilter by rememberSaveable { mutableStateOf(LedgerStatusFilter.ALL) }
    var selectedDateRange by rememberSaveable { mutableStateOf(DateRangeFilter.ALL) }
    var isRefreshing by remember { mutableStateOf(false) }

    // Header visibility state for scroll collapse
    var isHeaderVisible by remember { mutableStateOf(true) }

    val nestedScrollConnection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (available.y < -10f && isHeaderVisible) {
                    isHeaderVisible = false
                } else if (available.y > 10f && !isHeaderVisible) {
                    isHeaderVisible = true
                }
                return Offset.Zero
            }
        }
    }

    LaunchedEffect(isLoading) {
        if (!isLoading) isRefreshing = false
    }

    // Filtered Bills and Payments by Date Range
    val filteredBills = remember(bills, selectedDateRange) {
        filterBillsByDateRange(bills, selectedDateRange)
    }
    val filteredPayments = remember(payments, selectedDateRange) {
        filterPaymentsByDateRange(payments, selectedDateRange)
    }

    val filteredLedger = remember(ledgerCustomers, searchQuery, selectedSort, selectedStatusFilter, filteredBills, filteredPayments) {
        ledgerCustomers
            .filter { cust ->
                val matchesSearch = searchQuery.isBlank() ||
                        cust.customerName.contains(searchQuery, ignoreCase = true) ||
                        (cust.phone != null && cust.phone.contains(searchQuery, ignoreCase = true))
                val matchesFilter = when (selectedStatusFilter) {
                    LedgerStatusFilter.ALL -> true
                    LedgerStatusFilter.DUE -> cust.balance > 0
                    LedgerStatusFilter.OVERDUE -> cust.status.equals("OVERDUE", ignoreCase = true) || cust.daysOverdue > 0
                    LedgerStatusFilter.CREDIT -> cust.balance < 0
                    LedgerStatusFilter.CLEAR -> cust.balance == 0.0
                }
                matchesSearch && matchesFilter
            }
            .let { list ->
                when (selectedSort) {
                    LedgerSortOption.NAME_ASC -> list.sortedBy { it.customerName.lowercase() }
                    LedgerSortOption.NAME_DESC -> list.sortedByDescending { it.customerName.lowercase() }
                    LedgerSortOption.DUE_DESC -> list.sortedByDescending { it.balance }
                    LedgerSortOption.OVERDUE_DESC -> list.sortedByDescending { it.daysOverdue }
                    LedgerSortOption.RECENT -> list.sortedByDescending { it.lastBillDate ?: it.lastPaymentDate ?: "" }
                }
            }
    }

    val totalCust = remember(ledgerCustomers) { ledgerCustomers.size }
    val totalDue = remember(ledgerCustomers) { ledgerCustomers.filter { !it.excludeFromStats && it.balance > 0 }.sumOf { it.balance } }
    val totalCredit = remember(ledgerCustomers) { ledgerCustomers.filter { !it.excludeFromStats && it.balance < 0 }.sumOf { abs(it.balance) } }
    val netReceivable = totalDue - totalCredit

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Customer Ledger", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        isRefreshing = true
                        billingViewModel.loadBillingData()
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh Data")
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = {
                    isRefreshing = true
                    billingViewModel.loadBillingData { isRefreshing = false }
                },
                modifier = Modifier.fillMaxSize()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .nestedScroll(nestedScrollConnection)
                ) {
                    // --- 1. Collapsible M3 Header ---
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceContainerHighest,
                        shape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp),
                        tonalElevation = 2.dp,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 12.dp, start = 16.dp, end = 16.dp, top = 8.dp)
                        ) {
                            // Search Bar
                            PixelSearchBar(
                                query = searchQuery,
                                onQueryChange = { searchQuery = it },
                                placeholder = "Search customers...",
                                modifier = Modifier.fillMaxWidth()
                            )

                            AnimatedVisibility(
                                visible = isHeaderVisible,
                                enter = expandVertically() + fadeIn(),
                                exit = shrinkVertically() + fadeOut()
                            ) {
                                Column {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    // Summary Stats Ribbon
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        KpiStatCard(
                                            title = "Net Receivable",
                                            value = "₹${"%,.0f".format(netReceivable)}",
                                            icon = Icons.Default.AccountBalanceWallet,
                                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                            modifier = Modifier.weight(1.2f)
                                        )
                                        KpiStatCard(
                                            title = "Customers",
                                            value = "$totalCust",
                                            icon = Icons.Default.People,
                                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                                            modifier = Modifier.weight(0.8f)
                                        )
                                    }

                                    Spacer(modifier = Modifier.height(12.dp))
                                    // Date Filter & Sort
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        var dateFilterExpanded by remember { mutableStateOf(false) }
                                        Box {
                                            FilterChip(
                                                selected = selectedDateRange != DateRangeFilter.ALL,
                                                onClick = { dateFilterExpanded = true },
                                                label = { Text(selectedDateRange.label) },
                                                trailingIcon = { Icon(Icons.Default.ArrowDropDown, null) }
                                            )
                                            DropdownMenu(
                                                expanded = dateFilterExpanded,
                                                onDismissRequest = { dateFilterExpanded = false }
                                            ) {
                                                DateRangeFilter.values().forEach { range ->
                                                    DropdownMenuItem(
                                                        text = { Text(range.label) },
                                                        onClick = {
                                                            selectedDateRange = range
                                                            dateFilterExpanded = false
                                                        }
                                                    )
                                                }
                                            }
                                        }

                                        var sortMenuExpanded by remember { mutableStateOf(false) }
                                        Box {
                                            AssistChip(
                                                onClick = { sortMenuExpanded = true },
                                                label = { Text("Sort: ${selectedSort.label}") },
                                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.Sort, null, Modifier.size(16.dp)) }
                                            )
                                            DropdownMenu(
                                                expanded = sortMenuExpanded,
                                                onDismissRequest = { sortMenuExpanded = false }
                                            ) {
                                                LedgerSortOption.values().forEach { option ->
                                                    DropdownMenuItem(
                                                        text = { Text(option.label) },
                                                        onClick = {
                                                            selectedSort = option
                                                            sortMenuExpanded = false
                                                        }
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // 2. Status Filter Chips
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        LedgerStatusFilter.values().forEach { filter ->
                            FilterChip(
                                selected = selectedStatusFilter == filter,
                                onClick = { selectedStatusFilter = filter },
                                label = { Text(filter.label) }
                            )
                        }
                    }

                    // 3. Customer List
                    if (filteredLedger.isEmpty()) {
                        EmptyLedgerPlaceholder(searchQuery)
                    } else {
                        LazyColumn(
                            contentPadding = PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            itemsIndexed(filteredLedger, key = { index, customer ->
                                "${customer.customerId}_${customer.customerName}_$index"
                            }) { _, customer ->
                                M3CustomerLedgerCard(
                                    customer = customer,
                                    onClick = {
                                        val targetId = customer.customerId.ifBlank { customer.customerName }
                                        navController.navigate("detailed_ledger/${targetId}")
                                    },
                                    onWhatsAppShare = { shareWhatsAppLedger(context, customer) },
                                    onShareLink = { shareLedgerLink(context, customer) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun M3CustomerLedgerCard(
    customer: LedgerCustomer,
    onClick: () -> Unit,
    onWhatsAppShare: () -> Unit,
    onShareLink: () -> Unit
) {
    val isCredit = customer.balance < 0
    val isClear = customer.balance == 0.0
    val isOverdue = customer.daysOverdue > 0
    val absBalance = abs(customer.balance)
    val initial = customer.customerName.take(1).uppercase()
    var expanded by remember(customer.customerId, customer.customerName) { mutableStateOf(false) }

    ElevatedCard(
        onClick = { expanded = !expanded },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = CircleShape,
                    color = if (isCredit) Color(0xFFE8F5E9) else if (isOverdue) Color(0xFFFFF3E0) else MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(44.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = initial,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (isCredit) Color(0xFF2E7D32) else if (isOverdue) Color(0xFFE65100) else MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = customer.customerName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (!customer.phone.isNullOrBlank()) {
                        Text(
                            text = customer.phone,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                PixelStatusBadge(status = customer.status)
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom
            ) {
                Column {
                    Text(
                        text = if (isCredit) "Credit Balance" else if (isClear) "Clear Balance" else "Amount Due",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "₹${"%,.2f".format(absBalance)}",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Black,
                        color = when {
                            isCredit -> Color(0xFF2E7D32)
                            isClear -> MaterialTheme.colorScheme.onSurface
                            isOverdue -> MaterialTheme.colorScheme.error
                            else -> MaterialTheme.colorScheme.primary
                        }
                    )
                }

                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = if (isOverdue) "${customer.daysOverdue}d overdue" else if (isClear) "Settled" else "Current",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (isOverdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = if (customer.lastBillDate != null || customer.lastPaymentDate != null) {
                            val latest = listOfNotNull(customer.lastBillDate, customer.lastPaymentDate)
                                .maxByOrNull { it ?: "" } ?: ""
                            "Updated ${getDaysAgoLabel(latest)}"
                        } else "No recent activity",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (customer.lastBillDate != null) {
                    AssistChip(
                        onClick = {},
                        label = { Text("Last Bill ${getDaysAgoLabel(customer.lastBillDate)}") },
                        enabled = false
                    )
                }
                if (customer.lastPaymentDate != null) {
                    AssistChip(
                        onClick = {},
                        label = { Text("Last Pmt ${getDaysAgoLabel(customer.lastPaymentDate)}") },
                        enabled = false
                    )
                }
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(Modifier.fillMaxWidth()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(modifier = Modifier.alpha(0.4f))
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onWhatsAppShare,
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            Icon(Icons.Default.Chat, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("WhatsApp")
                        }
                        OutlinedButton(
                            onClick = onShareLink,
                            modifier = Modifier.weight(1f),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Share")
                        }
                        Button(
                            onClick = onClick,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 10.dp)
                        ) {
                            Text("Open")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EmptyLedgerPlaceholder(query: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.AccountBalanceWallet,
                null,
                Modifier.size(64.dp),
                MaterialTheme.colorScheme.outlineVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = if (query.isNotBlank()) "No customers match '$query'" else "No ledger entries found",
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.outline
            )
        }
    }
}

private fun filterBillsByDateRange(bills: List<Bill>, range: DateRangeFilter): List<Bill> {
    if (range == DateRangeFilter.ALL) return bills
    val cal = Calendar.getInstance()
    val now = cal.timeInMillis

    return bills.filter { bill ->
        val dateStr = bill.date
        if (dateStr.isBlank()) return@filter true
        try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            val billDate = sdf.parse(dateStr.take(10))?.time ?: return@filter true
            val diffDays = (now - billDate) / (1000 * 60 * 60 * 24)

            when (range) {
                DateRangeFilter.THIS_MONTH -> diffDays <= 30
                DateRangeFilter.LAST_3 -> diffDays <= 90
                DateRangeFilter.LAST_6 -> diffDays <= 180
                DateRangeFilter.THIS_YEAR -> diffDays <= 365
                else -> true
            }
        } catch (e: Exception) {
            true
        }
    }
}

private fun filterPaymentsByDateRange(payments: List<PaymentRecord>, range: DateRangeFilter): List<PaymentRecord> {
    if (range == DateRangeFilter.ALL) return payments
    val cal = Calendar.getInstance()
    val now = cal.timeInMillis

    return payments.filter { pmt ->
        val dateStr = pmt.safePaymentDate
        if (dateStr.isBlank()) return@filter true
        try {
            val pmtDate = DateTimeUtils.parseDate(dateStr)?.time ?: return@filter true
            val diffDays = (now - pmtDate) / (1000 * 60 * 60 * 24)

            when (range) {
                DateRangeFilter.THIS_MONTH -> diffDays <= 30L
                DateRangeFilter.LAST_3 -> diffDays <= 90L
                DateRangeFilter.LAST_6 -> diffDays <= 180L
                DateRangeFilter.THIS_YEAR -> diffDays <= 365L
                else -> true
            }
        } catch (e: Exception) {
            true
        }
    }
}

private fun getDaysAgoLabel(dateStr: String?): String {
    if (dateStr.isNullOrBlank()) return "N/A"
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val date = sdf.parse(dateStr.take(10)) ?: return "N/A"
        val diffMs = Date().time - date.time
        val days = (diffMs / (1000 * 60 * 60 * 24)).toInt()
        if (days <= 0) "Today" else if (days == 1) "Yesterday" else "${days}d ago"
    } catch (e: Exception) {
        "N/A"
    }
}

private fun shareWhatsAppLedger(context: Context, customer: LedgerCustomer) {
    val targetId = customer.customerId.ifBlank { customer.customerName }
    val shareUrl = "https://mac.faizal.uk/customer-ledger.html?id=$targetId"
    val balStr = if (customer.balance < 0) "Credit Balance: ₹${"%,.2f".format(abs(customer.balance))}" else "Amount Due: ₹${"%,.2f".format(customer.balance)}"
    val msg = "Hello ${customer.customerName}!\n\nHere is your financial ledger statement:\n• $balStr\n\nView details here:\n$shareUrl"

    val waIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/?text=${Uri.encode(msg)}"))
    try {
        context.startActivity(waIntent)
    } catch (e: Exception) {
        Toast.makeText(context, "WhatsApp not installed", Toast.LENGTH_SHORT).show()
    }
}

private fun shareLedgerLink(context: Context, customer: LedgerCustomer) {
    val targetId = customer.customerId.ifBlank { customer.customerName }
    val shareUrl = "https://mac.faizal.uk/customer-ledger.html?id=$targetId"
    val sendIntent = Intent().apply {
        action = Intent.ACTION_SEND
        putExtra(Intent.EXTRA_TEXT, "Financial Ledger for ${customer.customerName}: $shareUrl")
        type = "text/plain"
    }
    context.startActivity(Intent.createChooser(sendIntent, "Share Ledger Link"))
}
