package com.example.macosbusinesssuite.ui.screens.billing

import com.example.macosbusinesssuite.ui.components.appMarquee
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.activity.compose.BackHandler
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.foundation.lazy.grid.GridItemSpan
import com.example.macosbusinesssuite.ui.components.VibrantPageBottomFiller
import com.example.macosbusinesssuite.ui.components.PixelSearchBar
import com.example.macosbusinesssuite.ui.components.KpiStatCard
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
import com.example.macosbusinesssuite.ui.components.PixelStatusBadge
import com.example.macosbusinesssuite.ui.viewmodels.*
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.text.SimpleDateFormat

enum class BillingSubPage(val title: String, val icon: ImageVector) {
    DASHBOARD("Dashboard", Icons.Default.Dashboard),
    ACTIONS("Operations", Icons.Default.FlashOn)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun BillingDashboardScreen(
    navController: NavController,
    billingViewModel: BillingViewModel,
    mainViewModel: MainViewModel
) {
    val isLoading by billingViewModel.isLoading.collectAsState()
    val metrics by billingViewModel.dashboardMetrics.collectAsState()
    val orderMetrics by billingViewModel.orderMetrics.collectAsState()
    val selectedPeriod by billingViewModel.selectedPeriod.collectAsState()
    val topProducts by billingViewModel.topProducts.collectAsState()
    val topCustomers by billingViewModel.topCustomers.collectAsState()
    val overdueReminders by billingViewModel.overdueReminders.collectAsState()
    val tickerInsights by billingViewModel.tickerInsights.collectAsState()
    val marqueeEnabled by mainViewModel.marqueeEnabled.collectAsState()
    val bills by billingViewModel.bills.collectAsState()
    val payments by billingViewModel.payments.collectAsState()
    val selectedSalesTrendPeriod by billingViewModel.selectedSalesTrendPeriod.collectAsState()
    val receivablesAging by billingViewModel.receivablesAging.collectAsState()

    var activeTab by remember { mutableIntStateOf(0) } // 0: Top Products, 1: Top Customers
    var selectedSubPage by rememberSaveable { mutableStateOf(BillingSubPage.DASHBOARD) }

    val canCreateBill = remember(mainViewModel.sessionManager.permissionsJson, mainViewModel.sessionManager.userRole) {
        mainViewModel.sessionManager.canCreate("billing")
    }
    val canEditBill = remember(mainViewModel.sessionManager.permissionsJson, mainViewModel.sessionManager.userRole) {
        mainViewModel.sessionManager.canEdit("billing")
    }

    // Industrial Standard Back Navigation: Sub-pages revert to Dashboard before app exit
    BackHandler(enabled = selectedSubPage != BillingSubPage.DASHBOARD) {
        selectedSubPage = BillingSubPage.DASHBOARD
    }
    
    // Scroll state for collapsing top page selector
    var isPageSelectorVisible by remember { mutableStateOf(true) }

    val nestedScrollConnection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (available.y < -10f && isPageSelectorVisible) {
                    isPageSelectorVisible = false
                } else if (available.y > 10f && !isPageSelectorVisible) {
                    isPageSelectorVisible = true
                }
                return Offset.Zero
            }
        }
    }

    val isLoggedIn by mainViewModel.isLoggedIn.collectAsState()
    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            billingViewModel.loadBillingData()
        }
    }

    LaunchedEffect(Unit) {
        if (mainViewModel.isLoggedIn.value && !mainViewModel.sessionManager.authToken.isNullOrBlank()) {
            billingViewModel.loadBillingData()
        }
    }

    var isRefreshing by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
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
                .background(MaterialTheme.colorScheme.background)
        ) {
            // --- 1. Unified Floating Header Box (Ported from ProductsScreen) ---
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                shape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp),
                shadowElevation = 6.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(bottom = 8.dp, start = 16.dp, end = 16.dp, top = 4.dp)
                ) {
                    // 1. Page Selector Pill
                    AnimatedVisibility(
                        visible = isPageSelectorVisible,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut()
                    ) {
                        Column {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surface, CircleShape)
                                    .padding(4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                BillingSubPage.values().forEach { subPage ->
                                    val isSelected = selectedSubPage == subPage
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(CircleShape)
                                            .background(if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                                            .clickable { selectedSubPage = subPage }
                                            .padding(vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            Icon(
                                                imageVector = subPage.icon,
                                                contentDescription = null,
                                                modifier = Modifier.size(18.dp),
                                                tint = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            AnimatedVisibility(
                                                visible = isSelected,
                                                enter = fadeIn() + expandHorizontally(),
                                                exit = fadeOut() + shrinkHorizontally()
                                            ) {
                                                Text(
                                                    text = subPage.title,
                                                    style = MaterialTheme.typography.labelLarge,
                                                    fontWeight = FontWeight.Bold,
                                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                                    maxLines = 1
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                        }
                    }

                    // 2. Search Bar
                    var searchQuery by remember { mutableStateOf("") }
                    PixelSearchBar(
                        query = searchQuery,
                        onQueryChange = { queryStr ->
                            searchQuery = queryStr
                            billingViewModel.setSearchQuery(queryStr)
                        },
                        placeholder = "Search bills, orders, or customers...",
                        modifier = Modifier.fillMaxWidth()
                    )

                    // 3. Time Selector
                    AnimatedVisibility(
                        visible = isPageSelectorVisible && selectedSubPage == BillingSubPage.DASHBOARD,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut()
                    ) {
                        Column {
                            Spacer(modifier = Modifier.height(12.dp))
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(MetricsPeriod.values()) { period ->
                                    FilterChip(
                                        selected = selectedPeriod == period,
                                        onClick = { billingViewModel.setMetricsPeriod(period) },
                                        label = { Text(period.label) },
                                        leadingIcon = if (selectedPeriod == period) {
                                            { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                                        } else null
                                    )
                                }
                            }
                        }
                    }

                    // 4. Live Ticker Insights Banner
                    if (tickerInsights.isNotEmpty() && selectedSubPage == BillingSubPage.DASHBOARD) {
                        Spacer(modifier = Modifier.height(12.dp))
                        LiveInsightTickerBanner(insights = tickerInsights)
                    }
            }
        }

        // --- 2. Main Content Area with slide/fade transition ---
        AnimatedContent(
            targetState = selectedSubPage,
            transitionSpec = {
                val targetIndex = targetState.ordinal
                val initialIndex = initialState.ordinal
                slideInHorizontally(initialOffsetX = { if (targetIndex > initialIndex) it else -it }) + fadeIn() togetherWith
                        slideOutHorizontally(targetOffsetX = { if (targetIndex > initialIndex) -it else it }) + fadeOut()
            },
            modifier = Modifier.fillMaxSize()
        ) { subPage ->
            if (subPage == BillingSubPage.DASHBOARD) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(bottom = 150.dp, top = 16.dp)
            ) {
                if (isLoading) {
                    item {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    }
                }

                // Live Ticker Insights Banner moved to header

                // Period Filter Chips moved to Header

                // Key Financial Metrics Grid (Matching Web dashboard.js 6 Statistics Cards)
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        // Row 1: Total Billed & Total Collected
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            KpiStatCard(
                                title = "Total Billed",
                                value = "₹${formatCurrency(metrics.totalBilled)}",
                                subtitle = "${metrics.totalBillsCount} bills",
                                rangeText = metrics.rangeText,
                                icon = Icons.AutoMirrored.Filled.TrendingUp,
                                modifier = Modifier.weight(1f),
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                marqueeEnabled = marqueeEnabled
                            )
                            KpiStatCard(
                                title = "Total Collected",
                                value = "₹${formatCurrency(metrics.totalPaid)}",
                                subtitle = "${metrics.totalPaymentsCount} payments",
                                rangeText = metrics.rangeText,
                                icon = Icons.Default.AccountBalanceWallet,
                                modifier = Modifier.weight(1f),
                                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                                marqueeEnabled = marqueeEnabled
                            )
                        }

                        // Row 2: Amount Due & Overdue Amount
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            KpiStatCard(
                                title = "Amount Due",
                                value = "₹${formatCurrency(metrics.amountDue)}",
                                subtitle = "To be collected",
                                rangeText = metrics.rangeText,
                                icon = Icons.Default.Schedule,
                                modifier = Modifier.weight(1f),
                                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                                marqueeEnabled = marqueeEnabled
                            )
                            KpiStatCard(
                                title = "Overdue Amount",
                                value = "₹${formatCurrency(metrics.overdueAmount)}",
                                subtitle = "Beyond 30 days",
                                rangeText = metrics.rangeText,
                                icon = Icons.Default.WarningAmber,
                                modifier = Modifier.weight(1f),
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                                contentColor = MaterialTheme.colorScheme.onErrorContainer,
                                marqueeEnabled = marqueeEnabled
                            )
                        }

                        // Row 3: Active Customers & Collection Rate
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            KpiStatCard(
                                title = "Active Customers",
                                value = "${metrics.activeCustomersCount}",
                                subtitle = "Unique customers",
                                rangeText = metrics.rangeText,
                                icon = Icons.Default.People,
                                modifier = Modifier.weight(1f),
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                                contentColor = MaterialTheme.colorScheme.onSurface,
                                marqueeEnabled = marqueeEnabled
                            )
                            KpiStatCard(
                                title = "Collection Rate",
                                value = "${String.format(Locale.getDefault(), "%.1f", metrics.collectionRatePercent)}%",
                                subtitle = "Payment ratio",
                                rangeText = metrics.rangeText,
                                icon = Icons.Default.PieChart,
                                modifier = Modifier.weight(1f),
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                                contentColor = MaterialTheme.colorScheme.onSurface,
                                marqueeEnabled = marqueeEnabled
                            )
                        }
                    }
                }

                // 2. Sales Analytics Card with Switchable Period & Line Chart
                item {
                    SalesAnalyticsCard(
                        bills = bills,
                        selectedTrendPeriod = selectedSalesTrendPeriod,
                        onTrendPeriodSelected = { billingViewModel.setSalesTrendPeriod(it) }
                    )
                }

                // 2.1 Daily Average Bill Analytics Card
                item {
                    AverageBillAnalyticsCard(bills = bills)
                }

                // 3. Order Stage Throughput Donut Chart
                item {
                    OrderThroughputDonutCard(orderMetrics = orderMetrics)
                }

                // 3.1 Order Metrics Summary
                item {
                    OrderMetricsSummaryCard(orderMetrics = orderMetrics)
                }

                // 4. Payment Methods Split Donut Chart
                item {
                    PaymentMethodsDonutCard(payments = payments)
                }

                // 5. Receivables Aging Progress Card
                item {
                    ReceivablesAgingCard(receivablesAging = receivablesAging)
                }

                // Order Stage Pipeline Summary (Added throughput context)
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Order Stage Pipeline",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold
                                )
                                // Throughput metric
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = "${orderMetrics.totalOrders} Orders Total",
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                OrderStageBadge("Draft", orderMetrics.stage1DraftCount, MaterialTheme.colorScheme.error)
                                OrderStageBadge("QC Check", orderMetrics.stage2QcCount, MaterialTheme.colorScheme.tertiary)
                                OrderStageBadge("Completed", orderMetrics.stage3CompleteCount, MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }

                // Overdue Payment Alerts / Reminders
                if (overdueReminders.isNotEmpty()) {
                    val criticalList = overdueReminders.filter { it.isCritical }
                    val warningList = overdueReminders.filter { !it.isCritical }

                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (criticalList.isNotEmpty()) {
                                Text(
                                    text = "🚨 CRITICAL OVERDUE (>60 DAYS)",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.error
                                )
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    criticalList.take(4).forEach { item ->
                                        OverdueReminderCard(item = item, onPayNow = {
                                            val route = if (item.customerName.isNotBlank()) "payments/${item.customerName}" else "payments"
                                            navController.navigate(route)
                                        }, marqueeEnabled = marqueeEnabled)
                                    }
                                }
                            }

                            if (warningList.isNotEmpty()) {
                                Text(
                                    text = "⚠️ WARNING OVERDUE (30–60 DAYS)",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.tertiary
                                )
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    warningList.take(4).forEach { item ->
                                        OverdueReminderCard(item = item, onPayNow = {
                                            val route = if (item.customerName.isNotBlank()) "payments/${item.customerName}" else "payments"
                                            navController.navigate(route)
                                        }, marqueeEnabled = marqueeEnabled)
                                    }
                                }
                            }
                        }
                    }
                }

                // Top Performers (Products & Customers)
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            PrimaryTabRow( // Updated to PrimaryTabRow as per M3 best practice
                                selectedTabIndex = activeTab,
                                containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                            ) {
                                Tab(
                                    selected = activeTab == 0,
                                    onClick = { activeTab = 0 },
                                    text = { Text("Top Products", fontWeight = FontWeight.Bold) }
                                )
                                Tab(
                                    selected = activeTab == 1,
                                    onClick = { activeTab = 1 },
                                    text = { Text("Top Customers", fontWeight = FontWeight.Bold) }
                                )
                            }
                            Spacer(modifier = Modifier.height(12.dp))

                            if (activeTab == 0) {
                                if (topProducts.isEmpty()) {
                                    Text("No product sales data in selected range.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                } else {
                                    topProducts.forEachIndexed { index, product ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .size(28.dp)
                                                    .clip(CircleShape)
                                                    .background(MaterialTheme.colorScheme.primaryContainer),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text("#${index + 1}", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                            }
                                            Spacer(modifier = Modifier.width(12.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    product.name,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = if (marqueeEnabled) 1 else 2,
                                                    overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                                                    modifier = Modifier.appMarquee(marqueeEnabled)
                                                )
                                                Text("${product.quantity.toInt()} units sold", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            Text(
                                                "₹${formatCurrency(product.revenue)}",
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                        }
                                        if (index < topProducts.size - 1) HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outlineVariant)
                                    }
                                }
                            } else {
                                if (topCustomers.isEmpty()) {
                                    Text("No customer data in selected range.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                } else {
                                    topCustomers.forEachIndexed { index, customer ->
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .size(28.dp)
                                                    .clip(CircleShape)
                                                    .background(MaterialTheme.colorScheme.secondaryContainer),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Text("#${index + 1}", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                            }
                                            Spacer(modifier = Modifier.width(12.dp))
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    customer.name,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = if (marqueeEnabled) 1 else 2,
                                                    overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                                                    modifier = Modifier.appMarquee(marqueeEnabled)
                                                )
                                                Text("${customer.ordersCount} orders", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            }
                                            Column(horizontalAlignment = Alignment.End) {
                                                Text("₹${formatCurrency(customer.billedAmount)}", fontWeight = FontWeight.Bold)
                                                if (customer.dueBalance > 0) {
                                                    Text("Due: ₹${formatCurrency(customer.dueBalance)}", fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
                                                }
                                            }
                                        }
                                        if (index < topCustomers.size - 1) HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp), color = MaterialTheme.colorScheme.outlineVariant)
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    VibrantPageBottomFiller(
                        title = "Financial Core Synced",
                        subtitle = "All ledger streams, metrics, and invoices updated in real-time.",
                        icon = Icons.AutoMirrored.Filled.TrendingUp,
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        badgeText = "✦ FINANCIAL ENGINE"
                    )
                }
            }
        } else {
            // --- 3. Second Page: Quick Actions Grid ---
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 150.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (canCreateBill) {
                    item { LargeActionCard("New Bill", "Create a new sales invoice", Icons.AutoMirrored.Filled.ReceiptLong, MaterialTheme.colorScheme.primaryContainer, marqueeEnabled = marqueeEnabled) { navController.navigate("new_bill") } }
                    item { LargeActionCard("New Order", "Draft a new sales order", Icons.Default.ShoppingCart, MaterialTheme.colorScheme.secondaryContainer, marqueeEnabled = marqueeEnabled) { navController.navigate("new_order") } }
                }
                item { LargeActionCard("Receive Payment", "Log an incoming payment", Icons.Default.Payments, MaterialTheme.colorScheme.tertiaryContainer, marqueeEnabled = marqueeEnabled) { navController.navigate("payments/Payment") } }
                item { LargeActionCard("Issue Credit Note", "Refund or adjust balance", Icons.Default.RequestQuote, MaterialTheme.colorScheme.errorContainer, marqueeEnabled = marqueeEnabled) { navController.navigate("payments/Credit Note") } }
                item { LargeActionCard("Customer Ledger", "View full customer accounts", Icons.AutoMirrored.Filled.MenuBook, MaterialTheme.colorScheme.surfaceContainerHigh, marqueeEnabled = marqueeEnabled) { navController.navigate("ledger") } }
                item { LargeActionCard("Transaction History", "View past bills & payments", Icons.Default.History, MaterialTheme.colorScheme.surfaceContainerHigh, marqueeEnabled = marqueeEnabled) { navController.navigate("payments/History") } }
                if (canEditBill) {
                    item { LargeActionCard("Edit Transactions", "Modify existing records", Icons.Default.Edit, MaterialTheme.colorScheme.surfaceContainerHigh, marqueeEnabled = marqueeEnabled) { navController.navigate("edit_billing") } }
                }
                item(span = { GridItemSpan(2) }) {
                    VibrantPageBottomFiller(
                        title = "Operations Desk Ready",
                        subtitle = "Create invoices, record payments, and manage sales orders on demand.",
                        icon = Icons.Default.Bolt,
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                        badgeText = "✦ QUICK ACTIONS"
                    )
                }
            }
        }
    } // closes AnimatedContent
    } // closes Column
    } // closes PullToRefreshBox

        if (selectedSubPage == BillingSubPage.DASHBOARD) {
            AnimatedBillingSpeedDial(
                navController = navController,
                canCreateBill = canCreateBill,
                canEditBill = canEditBill
            )
        }
    } // closes Box
} // closes BillingDashboardScreen

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LiveInsightTickerBanner(insights: List<String>) {
    var currentIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(insights) {
        if (insights.isNotEmpty()) {
            while (true) {
                kotlinx.coroutines.delay(4000L)
                currentIndex = (currentIndex + 1) % insights.size
            }
        }
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.NotificationsActive,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            AnimatedContent(targetState = insights.getOrElse(currentIndex) { "" }, label = "Ticker") { text ->
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    modifier = Modifier.basicMarquee() // Marquee for ticker!
                )
            }
        }
    }
}

@Composable
fun OrderStageBadge(stageName: String, count: Int, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            color = color.copy(alpha = 0.15f),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text(
                text = "$count",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = color,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = stageName, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OverdueReminderCard(item: OverdueReminderItem, onPayNow: () -> Unit, marqueeEnabled: Boolean = true) {
    val containerColor = if (item.isCritical) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.tertiaryContainer
    val contentColor = if (item.isCritical) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onTertiaryContainer

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        item.customerName,
                        fontWeight = FontWeight.Bold,
                        color = contentColor,
                        maxLines = 1,
                        overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                        modifier = Modifier.appMarquee(marqueeEnabled).weight(1f, fill = false)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    PixelStatusBadge(status = if (item.isCritical) "CRITICAL" else "WARNING")
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Bill #${item.billId} • ${item.daysOverdue} days overdue",
                    style = MaterialTheme.typography.bodySmall,
                    color = contentColor.copy(alpha = 0.8f),
                    maxLines = 1,
                    overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                    modifier = Modifier.appMarquee(marqueeEnabled)
                )
                Text(
                    "₹${formatCurrency(item.amount)} due",
                    fontWeight = FontWeight.Bold,
                    color = contentColor
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Button(
                onClick = onPayNow,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Pay Now", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
fun LargeActionCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    containerColor: Color,
    marqueeEnabled: Boolean = true,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .aspectRatio(1f) // Square card
            .clickable { onClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Icon(
                imageVector = icon,
                contentDescription = title,
                modifier = Modifier.size(36.dp),
                tint = MaterialTheme.colorScheme.contentColorFor(containerColor)
            )
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.contentColorFor(containerColor),
                    maxLines = if (marqueeEnabled) 1 else 2,
                    overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                    modifier = Modifier.appMarquee(marqueeEnabled)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.contentColorFor(containerColor).copy(alpha = 0.8f),
                    maxLines = if (marqueeEnabled) 1 else 2,
                    overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                    modifier = Modifier.appMarquee(marqueeEnabled)
                )
            }
        }
    }
}

fun formatCurrency(value: Double): String {
    return String.format(Locale.getDefault(), "%,.0f", value)
}

@Composable
fun AnimatedBillingSpeedDial(
    navController: NavController,
    canCreateBill: Boolean = true,
    canEditBill: Boolean = true,
    modifier: Modifier = Modifier
) {
    var expandedPhase by remember { mutableIntStateOf(0) }
    var isDialOpen by remember { mutableStateOf(false) }

    val labels = listOf(
        "New Order",
        "New Bill",
        "New Payment",
        "New Credit Note",
        "Edit Transaction"
    )

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(800L)
        for (i in 1..4) {
            expandedPhase = i
            kotlinx.coroutines.delay(550L)
        }
        kotlinx.coroutines.delay(650L)
        expandedPhase = 5 // Collapsed
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.navigationBars)
    ) {
        // Dimmed overlay when Speed Dial is open
        AnimatedVisibility(
            visible = isDialOpen,
            enter = fadeIn(animationSpec = tween(250)),
            exit = fadeOut(animationSpec = tween(200))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.35f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { isDialOpen = false }
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 86.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Speed Dial Bubbles with smooth scale/expand animation like profile bubble
            AnimatedVisibility(
                visible = isDialOpen,
                enter = expandVertically(
                    expandFrom = Alignment.Bottom,
                    animationSpec = tween(durationMillis = 350, easing = FastOutSlowInEasing)
                ) + fadeIn() + scaleIn(initialScale = 0.8f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 1f)),
                exit = shrinkVertically(
                    shrinkTowards = Alignment.Bottom,
                    animationSpec = tween(durationMillis = 280, easing = FastOutSlowInEasing)
                ) + fadeOut() + scaleOut(targetScale = 0.8f, transformOrigin = androidx.compose.ui.graphics.TransformOrigin(1f, 1f))
            ) {
                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (canCreateBill) {
                        BillingDialItem("New Order", Icons.Default.ShoppingCart) {
                            isDialOpen = false
                            navController.navigate("new_order")
                        }
                        BillingDialItem("New Bill", Icons.AutoMirrored.Filled.ReceiptLong) {
                            isDialOpen = false
                            navController.navigate("new_bill")
                        }
                    }
                    BillingDialItem("New Payment", Icons.Default.Payments) {
                        isDialOpen = false
                        navController.navigate("payments/Payment")
                    }
                    BillingDialItem("New Credit Note", Icons.Default.RequestQuote) {
                        isDialOpen = false
                        navController.navigate("payments/Credit Note")
                    }
                    if (canEditBill) {
                        BillingDialItem("Edit Transaction", Icons.Default.Edit) {
                            isDialOpen = false
                            navController.navigate("edit_billing")
                        }
                    }
                }
            }

            // Main FAB
            Surface(
                onClick = { isDialOpen = !isDialOpen },
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                tonalElevation = 6.dp,
                border = BorderStroke(1.2.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)),
                modifier = Modifier.animateContentSize()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = if (isDialOpen) Icons.Default.Clear else Icons.Default.Add,
                        contentDescription = "New",
                        modifier = Modifier.size(22.dp)
                    )

                    if (expandedPhase < 5 && !isDialOpen) {
                        Spacer(modifier = Modifier.width(8.dp))
                        AnimatedContent(
                            targetState = labels[expandedPhase],
                            transitionSpec = {
                                slideInVertically { height -> height } + fadeIn() togetherWith
                                slideOutVertically { height -> -height } + fadeOut()
                            }, label = "fabLabel"
                        ) { targetText ->
                            Text(
                                text = targetText,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BillingDialItem(label: String, icon: ImageVector, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surfaceContainerHighest,
            modifier = Modifier.padding(end = 12.dp)
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
            )
        }

        Surface(
            onClick = onClick,
            shape = CircleShape,
            color = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            tonalElevation = 4.dp,
            modifier = Modifier.size(48.dp)
        ) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Icon(icon, contentDescription = label, modifier = Modifier.size(24.dp))
            }
        }
    }
}

// ====================================================================
// SALES ANALYTICS & CHARTS CARDS (Matching Web dashboard.js)
// ====================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AverageBillAnalyticsCard(bills: List<Bill>) {
    var selectedAvgPreset by remember { mutableStateOf(AvgChartPreset.DAYS_30) }

    val (filteredBills, dateRangeLabel) = remember(bills, selectedAvgPreset) {
        val cal = Calendar.getInstance()
        val startDate: Date? = when (selectedAvgPreset) {
            AvgChartPreset.DAYS_7 -> { cal.add(Calendar.DAY_OF_YEAR, -7); cal.time }
            AvgChartPreset.DAYS_30 -> { cal.add(Calendar.DAY_OF_YEAR, -30); cal.time }
            AvgChartPreset.DAYS_90 -> { cal.add(Calendar.DAY_OF_YEAR, -90); cal.time }
            AvgChartPreset.THIS_YEAR -> { cal.set(Calendar.DAY_OF_YEAR, 1); cal.time }
            AvgChartPreset.ALL_TIME -> null
            AvgChartPreset.CUSTOM -> null
        }

        val filtered = bills.filter { b ->
            val d = FifoSettlementCalculator.parseDate(b.date)
            d != null && (startDate == null || !d.before(startDate))
        }
        val label = if (startDate != null) "Last ${selectedAvgPreset.displayName}" else "All Time"
        Pair(filtered, label)
    }

    val avgVal = if (filteredBills.isNotEmpty()) filteredBills.sumOf { it.grandTotal } / filteredBills.size else 0.0

    val dailyAvgPoints = remember(filteredBills) {
        val points = mutableListOf<Float>()
        if (filteredBills.isNotEmpty()) {
            val grouped = filteredBills.groupBy { b ->
                FifoSettlementCalculator.parseDate(b.date)?.let {
                    val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                    sdf.format(it)
                } ?: ""
            }.filterKeys { it.isNotEmpty() }

            val sortedDates = grouped.keys.sorted().takeLast(10)
            sortedDates.forEach { dStr ->
                val list = grouped[dStr] ?: emptyList()
                val avg = if (list.isNotEmpty()) list.sumOf { it.grandTotal } / list.size else 0.0
                points.add(avg.toFloat())
            }
        }
        if (points.isEmpty()) listOf(0f, 0f, 0f, 0f, 0f) else points
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Receipt, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary)
                    Text("Average Bill Analytics", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(AvgChartPreset.values()) { preset ->
                    val selected = selectedAvgPreset == preset
                    FilterChip(
                        selected = selected,
                        onClick = { selectedAvgPreset = preset },
                        label = { Text(preset.displayName, fontSize = 11.sp) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text("₹${formatCurrency(avgVal)}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.tertiary)
            Text("Daily average bill trend • $dateRangeLabel", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Spacer(modifier = Modifier.height(14.dp))
            CanvasLineChart(
                dataPoints = dailyAvgPoints,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
                lineColor = MaterialTheme.colorScheme.tertiary
            )
        }
    }
}

@Composable
fun SalesAnalyticsCard(
    bills: List<Bill>,
    selectedTrendPeriod: SalesTrendPeriod,
    onTrendPeriodSelected: (SalesTrendPeriod) -> Unit
) {
    val totalSales = bills.sumOf { it.grandTotal }
    var selectedIndex by remember { mutableIntStateOf(-1) }

    // Reset selected point when trend period changes
    LaunchedEffect(selectedTrendPeriod) {
        selectedIndex = -1
    }

    // Group sales into 6 trend points
    val trendPoints = remember(bills, selectedTrendPeriod) {
        val points = mutableListOf<Float>()
        val cal = Calendar.getInstance()
        val now = cal.time

        for (i in 5 downTo 0) {
            val c = Calendar.getInstance()
            c.time = now
            when (selectedTrendPeriod) {
                SalesTrendPeriod.MONTHLY -> c.add(Calendar.MONTH, -i)
                SalesTrendPeriod.QUARTERLY -> c.add(Calendar.MONTH, -i * 3)
                SalesTrendPeriod.YEARLY -> c.add(Calendar.YEAR, -i)
            }
            val targetYear = c.get(Calendar.YEAR)
            val targetMonth = c.get(Calendar.MONTH)

            val sum = bills.filter { b ->
                val bDate = FifoSettlementCalculator.parseDate(b.date)
                if (bDate != null) {
                    val bc = Calendar.getInstance()
                    bc.time = bDate
                    when (selectedTrendPeriod) {
                        SalesTrendPeriod.MONTHLY -> bc.get(Calendar.YEAR) == targetYear && bc.get(Calendar.MONTH) == targetMonth
                        SalesTrendPeriod.QUARTERLY -> bc.get(Calendar.YEAR) == targetYear && (bc.get(Calendar.MONTH) / 3) == (targetMonth / 3)
                        SalesTrendPeriod.YEARLY -> bc.get(Calendar.YEAR) == targetYear
                    }
                } else false
            }.sumOf { it.grandTotal }.toFloat()

            points.add(sum)
        }
        points
    }

    val displaySales = if (selectedIndex >= 0 && selectedIndex < trendPoints.size) {
        trendPoints[selectedIndex].toDouble()
    } else totalSales

    val displaySubtitle = if (selectedIndex >= 0 && selectedIndex < trendPoints.size) {
        "Selected Period #${selectedIndex + 1} revenue • Tap another point to inspect"
    } else {
        "Revenue trend over ${selectedTrendPeriod.label.lowercase()} periods • Tap points to inspect"
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.AutoMirrored.Filled.TrendingUp, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Sales Analytics", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }

                // Period Switcher
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    SalesTrendPeriod.values().forEach { period ->
                        val selected = selectedTrendPeriod == period
                        Surface(
                            shape = CircleShape,
                            color = if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                            onClick = { onTrendPeriodSelected(period) }
                        ) {
                            Text(
                                text = period.label,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                color = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text("₹${formatCurrency(displaySales)}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary)
            Text(displaySubtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Spacer(modifier = Modifier.height(16.dp))
            CanvasLineChart(
                dataPoints = trendPoints,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(140.dp),
                lineColor = MaterialTheme.colorScheme.primary,
                selectedIndex = selectedIndex,
                onPointSelected = { idx -> selectedIndex = idx }
            )
        }
    }
}

@Composable
fun OrderThroughputDonutCard(orderMetrics: OrderMetricsState) {
    val values = listOf(
        orderMetrics.stage1DraftCount.toFloat(),
        orderMetrics.stage2QcCount.toFloat(),
        orderMetrics.stage3CompleteCount.toFloat()
    )
    val colors = listOf(
        MaterialTheme.colorScheme.error,
        MaterialTheme.colorScheme.tertiary,
        MaterialTheme.colorScheme.primary
    )
    val labels = listOf("Draft (Stage 1)", "QC Check (Stage 2)", "Completed (Stage 3)")

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Order Stage Throughput", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                CanvasDonutChart(values = values, colors = colors, modifier = Modifier.size(120.dp))

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    labels.forEachIndexed { i, label ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(colors[i]))
                            Text(label, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                            Text("(${values[i].toInt()})", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = colors[i])
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun OrderMetricsSummaryCard(orderMetrics: OrderMetricsState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Order Metrics Summary", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Avg ₹${formatCurrency(orderMetrics.avgOrderValue)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SummaryMetricCard(
                    title = "Total Orders",
                    value = orderMetrics.totalOrders.toString(),
                    subtitle = "Issued",
                    modifier = Modifier.weight(1f)
                )
                SummaryMetricCard(
                    title = "Fulfilled",
                    value = orderMetrics.fulfilledOrdersCount.toString(),
                    subtitle = "Completed",
                    modifier = Modifier.weight(1f)
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SummaryMetricCard(
                    title = "Pending",
                    value = orderMetrics.pendingOrdersCount.toString(),
                    subtitle = "In pipeline",
                    modifier = Modifier.weight(1f)
                )
                SummaryMetricCard(
                    title = "Delivered",
                    value = orderMetrics.totalDeliveredQty.toString(),
                    subtitle = "Qty",
                    modifier = Modifier.weight(1f)
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SummaryMetricCard(
                    title = "Paid on Orders",
                    value = "₹${formatCurrency(orderMetrics.totalPaidOnOrders)}",
                    subtitle = "Settled",
                    modifier = Modifier.weight(1f)
                )
                SummaryMetricCard(
                    title = "Order Value",
                    value = "₹${formatCurrency(orderMetrics.totalOrderedValue)}",
                    subtitle = "Total",
                    modifier = Modifier.weight(1f)
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SummaryMetricCard(
                    title = "Fulfillment Ratio",
                    value = "${String.format(Locale.getDefault(), "%.1f", orderMetrics.fulfillmentQtyRatio)}%",
                    subtitle = "Items ratio",
                    modifier = Modifier.weight(1f)
                )
                SummaryMetricCard(
                    title = "Settlement Ratio",
                    value = "${String.format(Locale.getDefault(), "%.1f", orderMetrics.settlementPaidRatio)}%",
                    subtitle = "Payment ratio",
                    modifier = Modifier.weight(1f)
                )
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val unsettled = Math.max(0.0, orderMetrics.totalDeliveredValue - orderMetrics.totalPaidOnOrders)
                SummaryMetricCard(
                    title = "Unsettled Value",
                    value = "₹${formatCurrency(unsettled)}",
                    subtitle = "Pending receivables",
                    modifier = Modifier.weight(1f)
                )
                SummaryMetricCard(
                    title = "Fulfillment Speed",
                    value = orderMetrics.fulfillmentSpeedDaysText,
                    subtitle = "Avg delivery time",
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
fun SummaryMetricCard(title: String, value: String, subtitle: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
            .padding(12.dp)
    ) {
        Text(title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(modifier = Modifier.height(8.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(4.dp))
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun PaymentMethodsDonutCard(payments: List<PaymentRecord>) {
    val split = remember(payments) {
        val map = mutableMapOf<String, Double>()
        payments.forEach { p ->
            val medium = p.paymentMedium.ifEmpty { p.paymentMode.ifEmpty { "Cash" } }
            map[medium] = (map[medium] ?: 0.0) + p.effectiveAmount
        }
        map
    }

    if (split.isEmpty()) return

    val labels = split.keys.toList()
    val values = split.values.map { it.toFloat() }
    val colors = listOf(
        Color(0xFF10B981), Color(0xFF3B82F6), Color(0xFFF59E0B), Color(0xFF8B5CF6), Color(0xFFEC4899)
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Payment Methods Split", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                CanvasDonutChart(values = values, colors = colors, modifier = Modifier.size(120.dp))

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    labels.take(5).forEachIndexed { i, label ->
                        val amt = split[label] ?: 0.0
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(colors[i % colors.size]))
                            Text(label, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                            Text("₹${formatCurrency(amt)}", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ReceivablesAgingCard(receivablesAging: ReceivablesAging) {
    val total = if (receivablesAging.totalOutstanding > 0) receivablesAging.totalOutstanding else 1.0

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Receivables Aging", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Icon(Icons.Default.HourglassBottom, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            }
            Spacer(modifier = Modifier.height(12.dp))

            Text("Total Outstanding: ₹${formatCurrency(receivablesAging.totalOutstanding)}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
            Spacer(modifier = Modifier.height(12.dp))

            AgingRow("0–30 Days", receivablesAging.outstanding0to30, (receivablesAging.outstanding0to30 / total).toFloat(), Color(0xFFF59E0B))
            AgingRow("31–60 Days", receivablesAging.outstanding31to60, (receivablesAging.outstanding31to60 / total).toFloat(), Color(0xFFEF4444))
            AgingRow("61+ Days (Critical)", receivablesAging.outstanding61Plus, (receivablesAging.outstanding61Plus / total).toFloat(), Color(0xFF991B1B))
        }
    }
}

@Composable
fun AgingRow(label: String, amount: Double, progress: Float, color: Color) {
    Column(modifier = Modifier.padding(vertical = 4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("₹${formatCurrency(amount)}", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.height(4.dp))
        LinearProgressIndicator(
            progress = { progress.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
            color = color,
            trackColor = MaterialTheme.colorScheme.surfaceVariant
        )
    }
}

@Composable
fun CanvasLineChart(
    dataPoints: List<Float>,
    modifier: Modifier = Modifier,
    lineColor: Color,
    selectedIndex: Int = -1,
    onPointSelected: ((Int) -> Unit)? = null
) {
    if (dataPoints.isEmpty()) return
    val strokeColor = lineColor

    Canvas(
        modifier = modifier.pointerInput(dataPoints) {
            if (onPointSelected != null && dataPoints.isNotEmpty()) {
                detectTapGestures { tapOffset ->
                    val stepX = size.width / (dataPoints.size - 1).coerceAtLeast(1)
                    val idx = kotlin.math.round(tapOffset.x / stepX).toInt().coerceIn(0, dataPoints.size - 1)
                    onPointSelected(idx)
                }
            }
        }
    ) {
        val maxVal = (dataPoints.maxOrNull() ?: 1f).coerceAtLeast(1f)
        val minVal = 0f
        val range = maxVal - minVal

        val stepX = size.width / (dataPoints.size - 1).coerceAtLeast(1)
        val points = dataPoints.mapIndexed { index, valPt ->
            val x = index * stepX
            val y = size.height - ((valPt - minVal) / range * size.height * 0.8f) - (size.height * 0.1f)
            Offset(x, y)
        }

        // Draw grid lines
        val gridLines = 4
        for (i in 0..gridLines) {
            val y = size.height * (i.toFloat() / gridLines)
            drawLine(
                color = Color.White.copy(alpha = 0.08f),
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 1f
            )
        }

        // Draw line connecting points
        for (i in 0 until points.size - 1) {
            drawLine(
                color = strokeColor,
                start = points[i],
                end = points[i + 1],
                strokeWidth = 3.dp.toPx()
            )
        }

        // Draw points
        points.forEachIndexed { index, pt ->
            val isSel = index == selectedIndex
            drawCircle(
                color = if (isSel) Color.White else strokeColor,
                radius = if (isSel) 7.dp.toPx() else 4.dp.toPx(),
                center = pt
            )
            if (isSel) {
                drawCircle(
                    color = strokeColor,
                    radius = 4.dp.toPx(),
                    center = pt
                )
            }
        }
    }
}

@Composable
fun CanvasDonutChart(
    values: List<Float>,
    colors: List<Color>,
    modifier: Modifier = Modifier
) {
    val total = values.sum().coerceAtLeast(1f)
    Canvas(modifier = modifier) {
        var startAngle = -90f
        val strokeWidth = 20.dp.toPx()
        val radius = (size.minDimension - strokeWidth) / 2f
        val topLeft = Offset((size.width - radius * 2) / 2f, (size.height - radius * 2) / 2f)
        val arcSize = androidx.compose.ui.geometry.Size(radius * 2, radius * 2)

        values.forEachIndexed { index, valPt ->
            val sweepAngle = (valPt / total) * 360f
            if (sweepAngle > 0) {
                drawArc(
                    color = colors.getOrElse(index) { Color.Gray },
                    startAngle = startAngle,
                    sweepAngle = sweepAngle,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = strokeWidth)
                )
                startAngle += sweepAngle
            }
        }
    }
}
