package com.example.macosbusinesssuite.ui.screens.analytics

import com.example.macosbusinesssuite.ui.components.appMarquee
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.activity.compose.BackHandler
import com.example.macosbusinesssuite.ui.components.VibrantPageBottomFiller
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.ui.components.KpiStatCard
import com.example.macosbusinesssuite.ui.components.M3SyncStatusPill
import com.example.macosbusinesssuite.ui.components.m3ValueChangeHighlight
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import java.text.NumberFormat
import java.util.Locale

enum class AnalyticsView(val title: String, val icon: String) {
    DASHBOARD("Dashboard", "📊"),
    SALES("Sales & Tax", "📈"),
    COMPARATIVE("Comparative", "⚖️"),
    ORDERS("Order Funnel", "🚚"),
    AGING("AR & RFM", "👥"),
    PRODUCTS("Products", "📦"),
    CUSTOMERS("Customer Insights", "👤")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(
    viewModel: MainViewModel
) {
    var selectedView by remember { mutableStateOf(AnalyticsView.DASHBOARD) }

    // Industrial Standard Sub-page Back Navigation for Analytics Views
    BackHandler(enabled = selectedView != AnalyticsView.DASHBOARD) {
        selectedView = AnalyticsView.DASHBOARD
    }

    val loading by viewModel.analyticsLoading.collectAsState()
    val marqueeEnabled by viewModel.marqueeEnabled.collectAsState()
    val executiveKPI by viewModel.executiveKPI.collectAsState()
    val topProducts by viewModel.topProducts.collectAsState()
    val topCustomers by viewModel.topCustomers.collectAsState()
    val salesDeepDive by viewModel.salesDeepDive.collectAsState()
    val orderFunnel by viewModel.orderFunnel.collectAsState()
    val arAging by viewModel.arAging.collectAsState()
    val rfmSegmentation by viewModel.rfmSegmentation.collectAsState()
    val productVelocity by viewModel.productVelocity.collectAsState()
    val categoryPerformance by viewModel.categoryPerformance.collectAsState()
    val comparativeYoY by viewModel.comparativeYoY.collectAsState()
    val comparativeMoM by viewModel.comparativeMoM.collectAsState()
    val comparativeQoQ by viewModel.comparativeQoQ.collectAsState()
    val comparativeCustom by viewModel.comparativeCustom.collectAsState()
    val contacts by viewModel.contacts.collectAsState()
    val selectedCustomerStats by viewModel.selectedCustomerStats.collectAsState()
    val selectedCustomer by viewModel.selectedCustomer.collectAsState()
    val isDataCached by viewModel.isDataCached.collectAsState()
    val isSyncingLive by viewModel.isSyncingLive.collectAsState()
    val lastSyncTimestamp by viewModel.lastSyncTimestamp.collectAsState()
    val changedMetricKeys by viewModel.changedMetricKeys.collectAsState()

    // Trigger initial data loads per view
    LaunchedEffect(selectedView) {
        when (selectedView) {
            AnalyticsView.DASHBOARD -> viewModel.loadAnalytics()
            AnalyticsView.SALES -> viewModel.loadSalesDeepDive("monthly")
            AnalyticsView.COMPARATIVE -> viewModel.loadComparativeYoY()
            AnalyticsView.ORDERS -> viewModel.loadOrderFunnel()
            AnalyticsView.AGING -> viewModel.loadARAgingAndRFM()
            AnalyticsView.PRODUCTS -> viewModel.loadProductVelocity()
            AnalyticsView.CUSTOMERS -> viewModel.loadContacts()
        }
    }

    // Scroll state for collapsing top page selector
    var isPageSelectorVisible by remember { mutableStateOf(true) }

    val nestedScrollConnection = remember {
        object : androidx.compose.ui.input.nestedscroll.NestedScrollConnection {
            override fun onPreScroll(available: androidx.compose.ui.geometry.Offset, source: androidx.compose.ui.input.nestedscroll.NestedScrollSource): androidx.compose.ui.geometry.Offset {
                if (available.y < -10f && isPageSelectorVisible) {
                    isPageSelectorVisible = false
                } else if (available.y > 10f && !isPageSelectorVisible) {
                    isPageSelectorVisible = true
                }
                return androidx.compose.ui.geometry.Offset.Zero
            }
        }
    }

    var isRefreshing by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        androidx.compose.material3.pulltorefresh.PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.refreshAllAnalyticsData {
                    isRefreshing = false
                }
            },
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .nestedScroll(nestedScrollConnection)
                    .background(MaterialTheme.colorScheme.background)
            ) {
                // Unified Floating Header Box (Ported from Billing & Products)
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
                            .padding(bottom = 8.dp, start = 12.dp, end = 12.dp, top = 4.dp)
                    ) {
                        // 1. Page Selector Pill Row
                        AnimatedVisibility(
                            visible = isPageSelectorVisible,
                            enter = expandVertically() + fadeIn(),
                            exit = shrinkVertically() + fadeOut()
                        ) {
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surface, CircleShape)
                                    .padding(4.dp)
                            ) {
                                items(AnalyticsView.values()) { view ->
                                    val isSelected = selectedView == view
                                    Surface(
                                        shape = CircleShape,
                                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                                        modifier = Modifier.clickable { selectedView = view }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Text(text = view.icon, fontSize = 14.sp)
                                            AnimatedVisibility(
                                                visible = isSelected,
                                                enter = fadeIn() + expandHorizontally(),
                                                exit = fadeOut() + shrinkHorizontally()
                                            ) {
                                                Text(
                                                    text = view.title,
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
                        }

                        // M3 Sync Status Pill
                        M3SyncStatusPill(
                            isDataCached = isDataCached,
                            isSyncingLive = isSyncingLive,
                            lastSyncTimestamp = lastSyncTimestamp,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp)
                        )
                    }
                }

                // Sub-View Content Box
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                ) {
            AnimatedContent(
                targetState = selectedView,
                transitionSpec = {
                    val isForward = targetState.ordinal > initialState.ordinal
                    (slideInHorizontally(
                        initialOffsetX = { if (isForward) it else -it },
                        animationSpec = tween(300, easing = FastOutSlowInEasing)
                    ) + fadeIn(animationSpec = tween(300))) togetherWith
                    (slideOutHorizontally(
                        targetOffsetX = { if (isForward) -it else it },
                        animationSpec = tween(300, easing = FastOutSlowInEasing)
                    ) + fadeOut(animationSpec = tween(300)))
                },
                modifier = Modifier.fillMaxSize().clipToBounds(),
                label = "AnalyticsViewTransition"
            ) { view ->
                when (view) {
                    AnalyticsView.DASHBOARD -> ExecutiveDashboardView(
                        kpi = executiveKPI,
                        topProducts = topProducts,
                        topCustomers = topCustomers,
                        onSwitchView = { target -> selectedView = target },
                        marqueeEnabled = marqueeEnabled,
                        changedMetricKeys = changedMetricKeys
                    )
                    AnalyticsView.SALES -> SalesReportsView(
                        data = salesDeepDive,
                        viewModel = viewModel,
                        onJumpToComparative = { selectedView = AnalyticsView.COMPARATIVE },
                        marqueeEnabled = marqueeEnabled
                    )
                    AnalyticsView.COMPARATIVE -> ComparativeAnalyticsView(
                        yoyData = comparativeYoY,
                        momData = comparativeMoM,
                        qoqData = comparativeQoQ,
                        customData = comparativeCustom,
                        viewModel = viewModel
                    )
                    AnalyticsView.ORDERS -> OrderFunnelView(
                        funnelData = orderFunnel
                    )
                    AnalyticsView.AGING -> ARAgingAndRFMView(
                        agingData = arAging,
                        rfmData = rfmSegmentation
                    )
                    AnalyticsView.PRODUCTS -> ProductVelocityView(
                        velocityData = productVelocity,
                        categoryData = categoryPerformance,
                        marqueeEnabled = marqueeEnabled
                    )
                    AnalyticsView.CUSTOMERS -> CustomerInsightsView(
                        contacts = contacts.filter { it.type == "Customer" },
                        selectedCustomer = selectedCustomer,
                        selectedStats = selectedCustomerStats,
                        onSelectCustomer = { customerId -> viewModel.loadCustomerStats(customerId) },
                        onClearCustomer = { viewModel.clearSelectedCustomer() }
                    )
                }
            }
        }
    }
}
}
}

// ==================== 1. EXECUTIVE DASHBOARD ====================
@Composable
fun ExecutiveDashboardView(
    kpi: ExecutiveKPI?,
    topProducts: List<TopProductItem>,
    topCustomers: List<TopCustomerItem>,
    onSwitchView: (AnalyticsView) -> Unit,
    marqueeEnabled: Boolean = true,
    changedMetricKeys: Set<String> = emptySet()
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        item {
            Text(
                text = "Executive Overview KPIs",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        // Row 1
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Billed Revenue",
                        value = formatCurrency(kpi?.totalBilled ?: kpi?.revenue ?: 0.0),
                        subtitle = "${kpi?.totalInvoices ?: kpi?.ordersCount ?: 0} invoices issued",
                        icon = Icons.Default.AttachMoney,
                        modifier = Modifier.m3ValueChangeHighlight(changedMetricKeys.contains("analytics_revenue")),
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Total Collected",
                        value = formatCurrency(kpi?.totalCollected ?: 0.0),
                        subtitle = "Net realization",
                        icon = Icons.Default.CheckCircle,
                        modifier = Modifier.m3ValueChangeHighlight(changedMetricKeys.contains("analytics_collected") || changedMetricKeys.contains("analytics_revenue")),
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
            }
        }

        // Row 2
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Receivables Due",
                        value = formatCurrency(kpi?.totalReceivables ?: kpi?.receivables ?: 0.0),
                        subtitle = "Outstanding credit",
                        icon = Icons.Default.Warning,
                        modifier = Modifier.m3ValueChangeHighlight(changedMetricKeys.contains("analytics_receivables")),
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Credit Notes Issued",
                        value = formatCurrency(kpi?.totalCreditNotes ?: 0.0),
                        subtitle = "Returns & adjustments",
                        icon = Icons.Default.Receipt,
                        modifier = Modifier.m3ValueChangeHighlight(changedMetricKeys.contains("analytics_credit_notes")),
                        containerColor = Color(0xFFFEF3C7),
                        contentColor = Color(0xFF92400E),
                        marqueeEnabled = marqueeEnabled
                    )
                }
            }
        }

        // Row 3
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Collection Rate",
                        value = "${kpi?.collectionRatePercent ?: 0.0}%",
                        subtitle = "Realization efficiency",
                        icon = Icons.Default.Speed,
                        modifier = Modifier.m3ValueChangeHighlight(changedMetricKeys.contains("analytics_collection_rate")),
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Active Customers",
                        value = "${kpi?.totalCustomers ?: kpi?.activeCustomers ?: 0}",
                        subtitle = "Registered accounts",
                        icon = Icons.Default.People,
                        modifier = Modifier.m3ValueChangeHighlight(changedMetricKeys.contains("analytics_active_customers")),
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                        marqueeEnabled = marqueeEnabled
                    )
                }
            }
        }

        // BI Quick Jump Modules (2x2 Grid with generous touch targets and no text squishing!)
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "⚡ Quick Jump BI Modules",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        ElevatedButton(
                            onClick = { onSwitchView(AnalyticsView.SALES) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(vertical = 12.dp, horizontal = 8.dp)
                        ) {
                            Text("📈 Sales & Tax Audit", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        ElevatedButton(
                            onClick = { onSwitchView(AnalyticsView.ORDERS) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(vertical = 12.dp, horizontal = 8.dp)
                        ) {
                            Text("🚚 Order Funnel", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        ElevatedButton(
                            onClick = { onSwitchView(AnalyticsView.AGING) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(vertical = 12.dp, horizontal = 8.dp)
                        ) {
                            Text("👥 AR Aging & RFM", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        ElevatedButton(
                            onClick = { onSwitchView(AnalyticsView.PRODUCTS) },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(vertical = 12.dp, horizontal = 8.dp)
                        ) {
                            Text("📦 Product Velocity", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }

        // Top Performing Products
        item {
            Text(
                text = "🏆 Top Performing Products",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        if (topProducts.isEmpty()) {
            item {
                Text(
                    text = "No top products data recorded",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(topProducts.take(5)) { prod ->
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                    modifier = Modifier
                        .fillMaxWidth()
                        .m3ValueChangeHighlight(changedMetricKeys.contains("analytics_top_products"), shape = RoundedCornerShape(12.dp))
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            val variant = if (prod.packSizeValue != null && prod.packSizeType != null) " (${prod.packSizeValue}${prod.packSizeType})" else ""
                            Text(
                                text = "${prod.name}$variant",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = if (marqueeEnabled) 1 else 2,
                                overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                                modifier = Modifier.appMarquee(marqueeEnabled)
                            )
                            Text(
                                text = "Qty Sold: ${prod.totalQty.toInt()} units",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = formatCurrency(prod.totalRevenue),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1
                        )
                    }
                }
            }
        }

        // High Value Customers
        item {
            Text(
                text = "💎 High Value Customers",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        if (topCustomers.isEmpty()) {
            item {
                Text(
                    text = "No top customer records found",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            items(topCustomers.take(5)) { cust ->
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
                    modifier = Modifier
                        .fillMaxWidth()
                        .m3ValueChangeHighlight(changedMetricKeys.contains("analytics_top_customers"), shape = RoundedCornerShape(12.dp))
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = cust.name,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = if (marqueeEnabled) 1 else 2,
                                overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                                modifier = Modifier.appMarquee(marqueeEnabled)
                            )
                            Text(
                                text = "${cust.orderCount.ifZero(cust.ordersCount)} orders issued",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = formatCurrency(cust.totalSpent),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.secondary,
                            maxLines = 1
                        )
                    }
                }
            }
        }

        item {
            com.example.macosbusinesssuite.ui.components.VibrantPageBottomFiller(
                title = "Real-Time Intelligence Active",
                subtitle = "Revenue trends, customer cohorts, and sales velocity computed.",
                icon = Icons.Default.Insights,
                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                badgeText = "✦ BUSINESS INTELLIGENCE"
            )
        }
    }
}

// ==================== 2. SALES REPORTS & TAX AUDIT ====================
@Composable
fun SalesReportsView(
    data: SalesDeepDiveResponse?,
    viewModel: MainViewModel,
    onJumpToComparative: () -> Unit,
    marqueeEnabled: Boolean = true
) {
    var period by remember { mutableStateOf("monthly") }

    val timeSeries = data?.timeSeries ?: emptyList()
    val taxSummary = data?.taxSummary

    val totalGross = timeSeries.sumOf { it.grossRevenue }
    val totalGst = timeSeries.sumOf { it.gstCollected }
    val totalDiscount = timeSeries.sumOf { it.discountGiven }
    val effectiveDiscountRate = if (totalGross > 0) ((totalDiscount / (totalGross + totalDiscount)) * 100) else 0.0

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        // Clean Header & Controls Split
        item {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "📈 Sales Performance & Tax Audit",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Revenue growth trends, tax breakdown (CGST/SGST), and discount audit",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = onJumpToComparative,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Text("⚖️ YoY/MoM Engine", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }

                    SingleChoiceSegmentedButtonRow {
                        SegmentedButton(
                            selected = period == "monthly",
                            onClick = {
                                period = "monthly"
                                viewModel.loadSalesDeepDive("monthly")
                            },
                            shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2)
                        ) {
                            Text("Monthly", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        SegmentedButton(
                            selected = period == "daily",
                            onClick = {
                                period = "daily"
                                viewModel.loadSalesDeepDive("daily")
                            },
                            shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2)
                        ) {
                            Text("Daily", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Summary KPI Cards
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Gross Revenue",
                        value = formatCurrency(totalGross),
                        subtitle = "Across ${timeSeries.size} periods",
                        icon = Icons.Default.AttachMoney,
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "GST Collected",
                        value = formatCurrency(totalGst),
                        subtitle = "Tax realization",
                        icon = Icons.Default.AccountBalance,
                        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                        contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
            }
        }

        // Trend Canvas Line/Bar Chart
        item {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "📊 Revenue & Invoice Velocity Trend",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    SalesTrendCanvasChart(
                        timeSeries = timeSeries,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                    )
                }
            }
        }

        // Full-Width Unsquished Tax Breakdown & Discount Audit Cards
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("🏛️ Tax Liability Breakdown (GST)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    val sgst = taxSummary?.totalSgst ?: (totalGst / 2)
                    val cgst = taxSummary?.totalCgst ?: (totalGst / 2)
                    StatRow("State GST (SGST):", formatCurrency(sgst), isBold = true)
                    StatRow("Central GST (CGST):", formatCurrency(cgst), isBold = true)
                    StatRow("Total GST Realized:", formatCurrency(totalGst), isBold = true, color = MaterialTheme.colorScheme.primary)
                }
            }
        }

        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("🏷️ Discount Leakage Audit", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    StatRow("Total Discount Allowed:", formatCurrency(totalDiscount), isBold = true, color = Color(0xFFD97706))
                    StatRow("Effective Discount Rate:", "%.2f%%".format(effectiveDiscountRate), isBold = true)
                    StatRow("Line-Item Special Discounts:", formatCurrency(taxSummary?.lineItemDiscounts ?: 0.0))
                }
            }
        }

        // Periodical Sales Breakdown Table
        item {
            Text("📋 Periodical Breakdown Table", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }

        items(timeSeries) { periodItem ->
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(periodItem.period, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        Text(formatCurrency(periodItem.grossRevenue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("${periodItem.invoiceCount} invoices issued", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("GST: ${formatCurrency(periodItem.gstCollected)} • Disc: ${formatCurrency(periodItem.discountGiven)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Sales & Tax Audit Active",
                subtitle = "Revenue growth trends, CGST/SGST audit, and discount analytics synced.",
                icon = Icons.Default.TrendingUp,
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                badgeText = "✦ AUDIT ENGINE"
            )
        }
    }
}

// ==================== 3. COMPARATIVE ANALYTICS & GROWTH ENGINE ====================
@Composable
fun ComparativeAnalyticsView(
    yoyData: YoYResponse?,
    momData: List<MoMItem>,
    qoqData: List<QoQItem>,
    customData: CustomComparisonResult?,
    viewModel: MainViewModel
) {
    var subTab by remember { mutableStateOf("yoy") }

    var startDateA by remember { mutableStateOf("2026-07-01") }
    var endDateA by remember { mutableStateOf("2026-07-26") }
    var startDateB by remember { mutableStateOf("2026-06-01") }
    var endDateB by remember { mutableStateOf("2026-06-30") }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        item {
            Column {
                Text(
                    text = "⚖️ Comparative Analytics Engine",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Benchmark YoY, MoM, QoQ, and Custom Period Permutations",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = subTab == "yoy",
                        onClick = {
                            subTab = "yoy"
                            viewModel.loadComparativeYoY()
                        },
                        label = { Text("📅 Year-on-Year", fontWeight = FontWeight.SemiBold) }
                    )
                }
                item {
                    FilterChip(
                        selected = subTab == "mom",
                        onClick = {
                            subTab = "mom"
                            viewModel.loadComparativeMoM()
                        },
                        label = { Text("📊 Month-on-Month", fontWeight = FontWeight.SemiBold) }
                    )
                }
                item {
                    FilterChip(
                        selected = subTab == "qoq",
                        onClick = {
                            subTab = "qoq"
                            viewModel.loadComparativeQoQ()
                        },
                        label = { Text("📈 Quarter-on-Quarter", fontWeight = FontWeight.SemiBold) }
                    )
                }
                item {
                    FilterChip(
                        selected = subTab == "custom",
                        onClick = { subTab = "custom" },
                        label = { Text("⚖️ Period A vs B", fontWeight = FontWeight.SemiBold) }
                    )
                }
            }
        }

        when (subTab) {
            "yoy" -> {
                val yearMap = yoyData?.yearMap ?: emptyMap()
                val years = yearMap.keys.sortedDescending()

                item {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("📅 Multi-Year Month-by-Month Matrix", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(12.dp))
                            val months = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
                            months.forEachIndexed { mIdx, mName ->
                                val latestVal = if (years.isNotEmpty()) yearMap[years[0]]?.getOrNull(mIdx) ?: 0.0 else 0.0
                                val prevVal = if (years.size > 1) yearMap[years[1]]?.getOrNull(mIdx) ?: 0.0 else 0.0
                                val growthPct = if (prevVal > 0) ((latestVal - prevVal) / prevVal * 100) else (if (latestVal > 0) 100.0 else 0.0)

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 6.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(mName, fontWeight = FontWeight.Bold, modifier = Modifier.width(45.dp))
                                    Text(formatCurrency(latestVal), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = if (growthPct >= 0) Color(0xFF10B981).copy(alpha = 0.15f) else Color(0xFFEF4444).copy(alpha = 0.15f)
                                    ) {
                                        Text(
                                            text = "${if (growthPct >= 0) "↑ +" else "↓ "}%.1f%%".format(growthPct),
                                            color = if (growthPct >= 0) Color(0xFF10B981) else Color(0xFFEF4444),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                        )
                                    }
                                }
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                            }
                        }
                    }
                }
            }

            "mom" -> {
                item {
                    Text("📋 Sequential Month-on-Month Variance", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                }

                items(momData.reversed()) { item ->
                    val isPos = item.growthPercent >= 0
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .padding(14.dp)
                                .fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.month, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                Text("${item.invoiceCount} bills • Prev: ${formatCurrency(item.prevRevenue)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Column(horizontalAlignment = Alignment.End) {
                                Text(formatCurrency(item.revenue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                Text(
                                    text = "${if (isPos) "↑ +" else "↓ "}${item.growthPercent}%",
                                    color = if (isPos) Color(0xFF10B981) else Color(0xFFEF4444),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }
            }

            "qoq" -> {
                item {
                    Text("📈 Quarterly Revenue Matrix across Years", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                }

                items(qoqData) { item ->
                    Card(
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .padding(14.dp)
                                .fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("${item.year} ${item.quarter}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                Text("${item.invoiceCount} bills issued", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(formatCurrency(item.revenue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }

            "custom" -> {
                item {
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("⚖️ Period A vs Period B Benchmark Comparator", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.height(12.dp))

                            Text("Period A (Target Date Range)", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = startDateA,
                                    onValueChange = { startDateA = it },
                                    label = { Text("Start Date") },
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = endDateA,
                                    onValueChange = { endDateA = it },
                                    label = { Text("End Date") },
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            Spacer(modifier = Modifier.height(10.dp))
                            Text("Period B (Baseline Date Range)", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary)
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = startDateB,
                                    onValueChange = { startDateB = it },
                                    label = { Text("Start Date") },
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = endDateB,
                                    onValueChange = { endDateB = it },
                                    label = { Text("End Date") },
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            Spacer(modifier = Modifier.height(14.dp))
                            Button(
                                onClick = { viewModel.runCustomComparison(startDateA, endDateA, startDateB, endDateB) },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Compare Permutation Benchmark", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                customData?.let { res ->
                    val pA = res.periodA
                    val pB = res.periodB
                    val varData = res.variance
                    val isPos = (varData?.revenueGrowthPercent ?: 0.0) >= 0

                    item {
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Period A Performance", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                                Text("${pA?.startDate} to ${pA?.endDate}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(formatCurrency(pA?.revenue ?: 0.0), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(6.dp))
                                StatRow("Invoices Count:", "${pA?.invoiceCount ?: 0} bills")
                                StatRow("Collections Realized:", formatCurrency(pA?.totalCollected ?: 0.0), isBold = true, color = Color(0xFF10B981))
                                StatRow("Avg Invoice Value:", formatCurrency(pA?.avgInvoiceValue ?: 0.0))
                            }
                        }
                    }

                    item {
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Period B Performance", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSecondaryContainer)
                                Text("${pB?.startDate} to ${pB?.endDate}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.8f))
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(formatCurrency(pB?.revenue ?: 0.0), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(6.dp))
                                StatRow("Invoices Count:", "${pB?.invoiceCount ?: 0} bills")
                                StatRow("Collections Realized:", formatCurrency(pB?.totalCollected ?: 0.0), isBold = true, color = Color(0xFF10B981))
                                StatRow("Avg Invoice Value:", formatCurrency(pB?.avgInvoiceValue ?: 0.0))
                            }
                        }
                    }

                    item {
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = if (isPos) Color(0xFF10B981).copy(alpha = 0.15f) else Color(0xFFEF4444).copy(alpha = 0.15f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier
                                    .padding(16.dp)
                                    .fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text("⚖️ Growth Variance Summary", fontWeight = FontWeight.Bold)
                                Text(
                                    text = "${if (isPos) "↑ +" else "↓ "}%.1f%% Growth".format(varData?.revenueGrowthPercent ?: 0.0),
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isPos) Color(0xFF10B981) else Color(0xFFEF4444)
                                )
                                Text("Delta: ${formatCurrency(varData?.revenueDiff ?: 0.0)}", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Comparative Matrix Active",
                subtitle = "Period A vs Period B YoY, MoM, and QoQ variance benchmarks computed.",
                icon = Icons.Default.Balance,
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                badgeText = "✦ BENCHMARK ENGINE"
            )
        }
    }
}

// ==================== 4. ORDER FUNNEL ====================
@Composable
fun OrderFunnelView(
    funnelData: OrderFunnelResponse?
) {
    val stages = funnelData?.stages ?: emptyList()
    val statuses = funnelData?.statuses ?: emptyList()
    val pending = funnelData?.pendingPipeline ?: emptyList()

    val pendingVal = stages.filter { it.currentStage == "stage1" || it.currentStage == "stage2" }.sumOf { it.totalValue }
    val pendingCount = stages.filter { it.currentStage == "stage1" || it.currentStage == "stage2" }.sumOf { it.orderCount }
    val completedCount = statuses.find { it.status == "complete" }?.orderCount ?: 0
    val totalOrdersCount = statuses.sumOf { it.orderCount }
    val completionRate = if (totalOrdersCount > 0) ((completedCount.toDouble() / totalOrdersCount) * 100) else 0.0

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        item {
            Column {
                Text("🚚 Order Stage & Fulfillment Pipeline", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Real-time tracking of order velocity across 3 fulfillment stages", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Full-width spacious stage cards (Unsquished!)
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                val stage1 = stages.find { it.currentStage == "stage1" }
                val stage2 = stages.find { it.currentStage == "stage2" }
                val stage3 = stages.find { it.currentStage == "stage3" }

                StageCardFull("Stage 1: Order Entry", "📝", stage1?.totalValue ?: 0.0, stage1?.orderCount ?: 0, MaterialTheme.colorScheme.primary)
                StageCardFull("Stage 2: QC & Packing", "📦", stage2?.totalValue ?: 0.0, stage2?.orderCount ?: 0, MaterialTheme.colorScheme.tertiary)
                StageCardFull("Stage 3: Fulfilled", "✅", stage3?.totalValue ?: 0.0, stage3?.orderCount ?: 0, Color(0xFF10B981))
            }
        }

        // Fulfillment Overview
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("⚡ Fulfillment Pipeline Overview", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(10.dp))
                    StatRow("Pending Order Value:", formatCurrency(pendingVal), isBold = true, color = MaterialTheme.colorScheme.tertiary)
                    StatRow("Orders in Pipeline:", "$pendingCount active orders")
                    StatRow("Fulfillment Rate:", "%.1f%%".format(completionRate), isBold = true, color = Color(0xFF10B981))
                    StatRow("Total Lifetime Orders:", "$totalOrdersCount orders")
                }
            }
        }

        // Active Pending Pipeline Table
        item {
            Text("⏳ Active Order Pipeline (Stage 1 & 2)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }

        if (pending.isEmpty()) {
            item {
                Text("No active pending orders in Stage 1 or Stage 2", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            items(pending) { item ->
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("#${item.orderNumber} • ${item.customerName}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("Stage: ${item.currentStage.uppercase()} • ${item.status.uppercase()}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(formatCurrency(item.totalAmount), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                    }
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Order Fulfillment Velocity Synced",
                subtitle = "Fulfillment pipeline stages, QC status, and pending orders tracked.",
                icon = Icons.Default.LocalShipping,
                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                badgeText = "✦ FULFILLMENT PIPELINE"
            )
        }
    }
}

@Composable
fun StageCardFull(name: String, icon: String, amount: Double, count: Int, color: Color) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.12f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .padding(14.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("$icon $name", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("$count orders pending in this stage", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(formatCurrency(amount), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color, maxLines = 1)
        }
    }
}

// ==================== 5. AR AGING & RFM INTELLIGENCE ====================
@Composable
fun ARAgingAndRFMView(
    agingData: ARAgingResponse?,
    rfmData: List<RFMCustomerItem>
) {
    val buckets = agingData?.buckets ?: emptyMap()
    val topDebtors = agingData?.topDebtors ?: emptyList()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        item {
            Column {
                Text("👥 Accounts Receivable Aging & RFM Intelligence", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Credit risk exposure tracking and customer health segmentation", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Aging Buckets Grid (2x2)
        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AgingBucketCard("0-30 Days Overdue", formatCurrency(buckets["0-30 days"] ?: 0.0), Color(0xFF10B981), Modifier.weight(1f))
                    AgingBucketCard("31-60 Days Overdue", formatCurrency(buckets["31-60 days"] ?: 0.0), Color(0xFFF59E0B), Modifier.weight(1f))
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    AgingBucketCard("61-90 Days Overdue", formatCurrency(buckets["61-90 days"] ?: 0.0), Color(0xFFF97316), Modifier.weight(1f))
                    AgingBucketCard("90+ Days Critical", formatCurrency(buckets["90+ days"] ?: 0.0), Color(0xFFEF4444), Modifier.weight(1f))
                }
            }
        }

        // Top Outstanding Debtors
        item {
            Text("⚠️ Top Outstanding Debtors", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }

        if (topDebtors.isEmpty()) {
            item {
                Text("No outstanding customer dues", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            items(topDebtors) { debtor ->
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(debtor.customerName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(debtor.currentStatus ?: "PENDING", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(formatCurrency(debtor.currentDue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error, maxLines = 1)
                    }
                }
            }
        }

        // RFM Customer Segmentation Matrix
        item {
            Text("🏆 Customer RFM Segmentation Matrix", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }

        items(rfmData) { rfm ->
            val tierColor = when (rfm.tier) {
                "VIP Tier" -> Color(0xFFD97706)
                "Frequent Buyer" -> MaterialTheme.colorScheme.primary
                "At Risk / Dormant" -> MaterialTheme.colorScheme.error
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            }

            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .padding(14.dp)
                        .fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(rfm.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(modifier = Modifier.height(2.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(shape = RoundedCornerShape(6.dp), color = tierColor.copy(alpha = 0.15f)) {
                                Text(rfm.tier, color = tierColor, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                            }
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("${rfm.orderFrequency} orders • ${rfm.recencyDays ?: "N/A"}d ago", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        }
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(formatCurrency(rfm.monetaryValue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Risk & RFM Watchlist Active",
                subtitle = "Overdue debt exposure, aging buckets, and customer recency monitored.",
                icon = Icons.Default.Groups,
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                badgeText = "✦ RISK INTELLIGENCE"
            )
        }
    }
}

@Composable
fun AgingBucketCard(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f)),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = color, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = color, maxLines = 1)
        }
    }
}

// ==================== 6. PRODUCT VELOCITY ====================
@Composable
fun ProductVelocityView(
    velocityData: ProductVelocityResponse?,
    categoryData: List<CategoryPerformanceItem>,
    marqueeEnabled: Boolean = true
) {
    val velocity = velocityData?.productVelocity ?: emptyList()
    val expiringBatches = velocityData?.expiringBatches ?: emptyList()

    val totalUnits = velocity.sumOf { it.totalUnitsSold }
    val totalRev = velocity.sumOf { it.totalRevenue }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        item {
            Column {
                Text("📦 Product Velocity & Batch Expiry Risk Watchlist", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("Category Pareto revenue share & expiring stock risk", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Overview Cards
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Units Sold",
                        value = "$totalUnits units",
                        subtitle = "Total volume",
                        icon = Icons.Default.ShoppingBag,
                        containerColor = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
                Box(modifier = Modifier.weight(1f)) {
                    KpiStatCard(
                        title = "Expiring Batches",
                        value = "${expiringBatches.size} batches",
                        subtitle = "Risk within 180d",
                        icon = Icons.Default.Warning,
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        marqueeEnabled = marqueeEnabled
                    )
                }
            }
        }

        // Fast Moving Velocity Rank Table
        item {
            Text("🚀 Product Sales Velocity Rank (Top Movers)", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }

        items(velocity) { item ->
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .padding(14.dp)
                        .fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.productName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Category: ${item.categoryName} • ${item.totalUnitsSold} units sold", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(formatCurrency(item.totalRevenue), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                }
            }
        }

        // Batch Expiry Risk Watchlist Table
        item {
            Text("⚠️ Batch Expiry Risk Watchlist", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }

        if (expiringBatches.isEmpty()) {
            item {
                Text("✓ No batches expiring within 180 days", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            items(expiringBatches) { batch ->
                val days = batch.daysToExpiry
                val isCritical = days <= 30
                val badgeColor = if (isCritical) Color(0xFFEF4444) else Color(0xFFD97706)

                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Batch: ${batch.batchNo} • ${batch.productName}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("MRP: ₹${batch.mrp} • Exp: ${batch.expDate ?: "N/A"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(shape = RoundedCornerShape(6.dp), color = badgeColor.copy(alpha = 0.15f)) {
                            Text(
                                text = if (days <= 0) "EXPIRED" else "$days days left",
                                color = badgeColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Stock Velocity & Risk Active",
                subtitle = "Batch expiry alerts, category Pareto revenue share, and stock turnover synced.",
                icon = Icons.Default.Inventory,
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                badgeText = "✦ STOCK VELOCITY"
            )
        }
    }
}

// ==================== 7. CUSTOMER INSIGHTS & PROFILE ====================
@Composable
fun CustomerInsightsView(
    contacts: List<Contact>,
    selectedCustomer: Contact?,
    selectedStats: CustomerStats?,
    onSelectCustomer: (String) -> Unit,
    onClearCustomer: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val filteredContacts = contacts.filter {
        it.name.contains(searchQuery, ignoreCase = true) || it.id.contains(searchQuery)
    }

    if (selectedCustomer != null && selectedStats != null) {
        CustomerProfileDetailView(
            customer = selectedCustomer,
            stats = selectedStats,
            onBack = onClearCustomer
        )
    } else {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
        ) {
            item {
                Column {
                    Text("👥 Customer Intelligence & Insights", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Deep-dive customer profiles, order history & settlement notes", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            item {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search Customers by Name or ID") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            items(filteredContacts) { customer ->
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelectCustomer(customer.id) }
                ) {
                    Row(
                        modifier = Modifier
                            .padding(14.dp)
                            .fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(customer.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("ID: ${customer.id} • ${customer.active ?: "INACTIVE"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = "Open Profile")
                    }
                }
            }

            item {
                VibrantPageBottomFiller(
                    title = "Customer Intelligence Synced",
                    subtitle = "Account ledgers, order history, and settlement performance verified.",
                    icon = Icons.Default.PersonSearch,
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                    badgeText = "✦ CUSTOMER MATRIX"
                )
            }
        }
    }
}

@Composable
fun CustomerProfileDetailView(
    customer: Contact,
    stats: CustomerStats,
    onBack: () -> Unit
) {
    val settlementText = if (stats.avgSettlementDays > 0) "%.0f Days".format(stats.avgSettlementDays) else "Immediate/No history"

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(top = 12.dp, bottom = 150.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back to customer list")
                }
                Text("Customer Profile", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.width(48.dp))
            }
        }

        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(customer.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${customer.address ?: "No address"} • ${customer.phone ?: "No phone"}", style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(modifier = Modifier.height(10.dp))
                    Text("GSTIN: ${customer.gstin ?: "Unregistered"}", style = MaterialTheme.typography.bodySmall)
                    Text("LIFETIME REVENUE: ${formatCurrency(stats.totalSales)}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Mini Stats Grid
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MiniStatCard("Avg Ticket", formatCurrency(stats.avgOrderValue), Modifier.weight(1f))
                MiniStatCard("Settlement", settlementText, Modifier.weight(1f))
                MiniStatCard("Outstanding", formatCurrency(stats.currentDue), Modifier.weight(1f), isError = stats.currentDue > 10000)
            }
        }

        // Favorite Re-orders
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("🛍️ Favorite Re-orders", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(10.dp))
                    if (stats.favoriteProducts.isEmpty()) {
                        Text("No re-order patterns found", style = MaterialTheme.typography.bodySmall)
                    } else {
                        stats.favoriteProducts.forEach { fav ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(fav.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Ordered ${fav.frequency} times", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, maxLines = 1)
                            }
                        }
                    }
                }
            }
        }

        // Payment Performance Note
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("📋 Payment Performance Note", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Customer settles accounts on average within $settlementText of billing. Currently carrying a balance of ${formatCurrency(stats.currentDue)}.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    if (stats.currentDue > 10000) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Caution: High outstanding balance (> ₹10,000).",
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Customer Profile Analytics Active",
                subtitle = "Individual ledger metrics, settlement velocity, and purchase history computed.",
                icon = Icons.Default.Badge,
                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                badgeText = "✦ PROFILE METRICS"
            )
        }
    }
}

// ==================== HELPER COMPONENTS ====================
@Composable
fun MiniStatCard(label: String, value: String, modifier: Modifier = Modifier, isError: Boolean = false) {
    Card(
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceContainer
        ),
        modifier = modifier
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                value,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = if (isError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
fun StatRow(label: String, value: String, isBold: Boolean = false, color: Color = Color.Unspecified) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal,
            color = if (color != Color.Unspecified) color else MaterialTheme.colorScheme.onSurface,
            maxLines = 1
        )
    }
}

@Composable
fun SalesTrendCanvasChart(
    timeSeries: List<SalesPeriodItem>,
    modifier: Modifier = Modifier
) {
    val barColor = MaterialTheme.colorScheme.primary

    if (timeSeries.isEmpty()) {
        Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Text("No sales trend records available", style = MaterialTheme.typography.bodyMedium)
        }
        return
    }

    val maxRevenue = (timeSeries.maxOfOrNull { it.grossRevenue } ?: 100.0).coerceAtLeast(1.0)

    Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height
        val barWidth = width / (timeSeries.size * 1.8f)

        timeSeries.forEachIndexed { idx, item ->
            val barHeight = (item.grossRevenue / maxRevenue * height).toFloat()
            val left = idx * (barWidth * 1.8f) + barWidth / 2
            val top = height - barHeight

            drawRect(
                color = barColor,
                topLeft = Offset(left, top),
                size = Size(barWidth, barHeight)
            )
        }
    }
}

fun formatCurrency(amount: Double): String {
    val formatter = NumberFormat.getNumberInstance(Locale.forLanguageTag("en-IN"))
    formatter.maximumFractionDigits = 0
    return "₹${formatter.format(amount)}"
}

fun Int.ifZero(fallback: Int): Int = if (this != 0) this else fallback
