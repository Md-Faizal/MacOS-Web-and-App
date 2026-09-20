package com.example.macosbusinesssuite.ui.screens.billing

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.Bill
import com.example.macosbusinesssuite.data.model.DetailedLedgerData
import com.example.macosbusinesssuite.data.model.PaymentRecord
import com.example.macosbusinesssuite.domain.calculation.FifoSettlementCalculator
import com.example.macosbusinesssuite.ui.components.KpiStatCard
import com.example.macosbusinesssuite.ui.components.PixelStatusBadge
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.abs

enum class LedgerViewTab(val title: String, val icon: ImageVector) {
    BILLS("Bills", Icons.AutoMirrored.Filled.ReceiptLong),
    PAYMENTS("Payments", Icons.Default.Payments),
    BOTH("Both", Icons.AutoMirrored.Filled.FormatListBulleted),
    TIMELINE("Timeline", Icons.Default.Timeline)
}

enum class DateFilterPeriod(val label: String) {
    ALL("All Dates"),
    THIS_MONTH("This Month"),
    LAST_3_MONTHS("Last 3M"),
    LAST_6_MONTHS("Last 6M"),
    THIS_YEAR("This Year")
}

sealed class LedgerRecordItem {
    data class BillRecord(val bill: Bill, val settlementInfo: FifoSettlementCalculator.SettlementInfo?) : LedgerRecordItem()
    data class PaymentItem(val payment: PaymentRecord) : LedgerRecordItem()
    data class OpeningBalanceRecord(val customerName: String, val amount: Double) : LedgerRecordItem()
}

data class AgingBreakdown(
    val d0to7: Double = 0.0,
    val d8to15: Double = 0.0,
    val d16to30: Double = 0.0,
    val over30: Double = 0.0
)

data class StatementRow(
    val dateMs: Long,
    val dateStr: String,
    val type: String,
    val reference: String,
    val debit: Double,
    val credit: Double,
    val runningBalance: Double,
    val recordItem: LedgerRecordItem,
    val infoText: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailedLedgerScreen(
    navController: NavController,
    billingViewModel: BillingViewModel,
    customerId: String
) {
    val ledgerData by billingViewModel.detailedLedger.collectAsState()

    DetailedLedgerScreenContent(
        navController = navController,
        billingViewModel = billingViewModel,
        customerId = customerId,
        ledgerData = ledgerData,
        fetchDetailedLedger = { billingViewModel.fetchDetailedLedger(it) }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailedLedgerScreenContent(
    navController: NavController,
    billingViewModel: BillingViewModel,
    customerId: String,
    ledgerData: DetailedLedgerData?,
    fetchDetailedLedger: (String) -> Unit
) {
    val context = LocalContext.current
    val bills by billingViewModel.bills.collectAsState()
    val payments by billingViewModel.payments.collectAsState()
    val contacts by billingViewModel.contacts.collectAsState()
    val isLoading by billingViewModel.isLoading.collectAsState()

    var selectedTab by rememberSaveable { mutableStateOf(LedgerViewTab.BOTH) }
    var selectedDateFilter by rememberSaveable { mutableStateOf(DateFilterPeriod.ALL) }

    var selectedRecordItem by remember { mutableStateOf<LedgerRecordItem?>(null) }
    var showActionBottomSheet by remember { mutableStateOf(false) }

    var showPreviewDialog by remember { mutableStateOf(false) }
    var previewBytes by remember { mutableStateOf<ByteArray?>(null) }
    var previewTitle by remember { mutableStateOf("") }

    var showAttachmentDialog by remember { mutableStateOf(false) }
    var attachmentBase64 by remember { mutableStateOf<String?>(null) }

    var showDeleteConfirmDialog by remember { mutableStateOf(false) }
    var deleteItemType by remember { mutableStateOf("") }
    var deleteItemId by remember { mutableStateOf("") }

    var showEditOpeningBalanceDialog by remember { mutableStateOf(false) }
    var newOpeningBalanceInput by remember { mutableStateOf("") }

    var showEditDateDialog by remember { mutableStateOf(false) }
    var editDateTargetItem by remember { mutableStateOf<LedgerRecordItem?>(null) }
    var editDateInput by remember { mutableStateOf("") }

    var showShareMenu by remember { mutableStateOf(false) }
    var exportFolderPath by remember { mutableStateOf<String?>(null) }

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

    val folderPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocumentTree()
    ) { uri: Uri? ->
        if (uri != null) {
            exportFolderPath = uri.toString()
            Toast.makeText(context, "Export Folder Set", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(customerId) {
        fetchDetailedLedger(customerId)
    }

    val currentContact = remember(contacts, customerId) {
        contacts.find { it.id == customerId }
            ?: contacts.find { it.name.trim().equals(customerId.trim(), ignoreCase = true) }
    }
    val customerName = currentContact?.name ?: ledgerData?.customer?.name ?: customerId.ifBlank { "All Customers" }
    val openingBalance = currentContact?.openingBalance ?: ledgerData?.customer?.openingBalance ?: 0.0

    val customerBills = remember(bills, customerId, customerName, ledgerData) {
        if (!ledgerData?.bills.isNullOrEmpty()) {
            ledgerData.bills
        } else if (customerId.isBlank() || customerId.equals("all", ignoreCase = true)) {
            bills
        } else {
            bills.filter { 
                (it.customerId != null && it.customerId == customerId) || 
                (it.customerName.trim().equals(customerName.trim(), ignoreCase = true))
            }
        }
    }
    val customerPayments = remember(payments, customerId, customerName, ledgerData) {
        if (!ledgerData?.payments.isNullOrEmpty()) {
            ledgerData.payments
        } else if (customerId.isBlank() || customerId.equals("all", ignoreCase = true)) {
            payments
        } else {
            payments.filter { 
                (it.customerId != null && it.customerId == customerId) || 
                (it.customerName.trim().equals(customerName.trim(), ignoreCase = true))
            }
        }
    }

    val filteredBills = remember(customerBills, selectedDateFilter) {
        filterBillsByPeriod(customerBills, selectedDateFilter)
    }
    val filteredPayments = remember(customerPayments, selectedDateFilter) {
        filterPaymentsByPeriod(customerPayments, selectedDateFilter)
    }

    val settlementMap = remember(filteredBills, filteredPayments, openingBalance) {
        FifoSettlementCalculator.calculateSettlementMap(filteredBills, filteredPayments, openingBalance)
    }

    val statementRows = remember(filteredBills, filteredPayments, openingBalance, customerName, ledgerData, selectedDateFilter, settlementMap) {
        if (selectedDateFilter == DateFilterPeriod.ALL && !ledgerData?.statementRows.isNullOrEmpty()) {
            ledgerData.statementRows.map { rowModel ->
                val typeUpper = rowModel.type.uppercase()
                val recordItem: LedgerRecordItem = when {
                    typeUpper.contains("OPENING") || rowModel.id?.toString() == "op-bal" -> {
                        LedgerRecordItem.OpeningBalanceRecord(customerName, openingBalance)
                    }
                    typeUpper.contains("BILL") || typeUpper.contains("INVOICE") -> {
                        val matchingBill = customerBills.find { 
                            it.id == rowModel.id?.toString() || 
                            it.billNumber.equals(rowModel.reference, ignoreCase = true) 
                        } ?: Bill(
                            id = rowModel.id?.toString() ?: "",
                            billNumber = rowModel.reference,
                            date = rowModel.dateFormatted?.takeIf { it != "-" } ?: (rowModel.date ?: ""),
                            grandTotal = rowModel.debit,
                            customerId = customerId,
                            customerName = customerName,
                            status = if (rowModel.infoText.contains("SETTLED", ignoreCase = true)) "PAID" else "PENDING"
                        )
                        LedgerRecordItem.BillRecord(matchingBill, settlementMap[matchingBill.id])
                    }
                    else -> {
                        val isCredit = typeUpper.contains("CREDIT")
                        val matchingPayment = customerPayments.find {
                            it.id == rowModel.id?.toString() ||
                            (it.referenceNo != null && it.referenceNo.equals(rowModel.reference, ignoreCase = true))
                        } ?: PaymentRecord(
                            id = rowModel.id?.toString() ?: "",
                            referenceNo = rowModel.reference,
                            paymentDate = rowModel.dateFormatted?.takeIf { it != "-" } ?: (rowModel.date ?: ""),
                            amount = if (isCredit) 0.0 else rowModel.credit,
                            creditAmount = if (isCredit) rowModel.credit else 0.0,
                            type = if (isCredit) "CREDIT_NOTE" else "PAYMENT",
                            customerId = customerId,
                            customerName = customerName
                        )
                        LedgerRecordItem.PaymentItem(matchingPayment)
                    }
                }
                val dateMs = FifoSettlementCalculator.parseDate(rowModel.date ?: rowModel.dateFormatted ?: "")?.time ?: 0L
                val displayDate = if (rowModel.dateFormatted.isNullOrBlank() || rowModel.dateFormatted == "-") {
                    rowModel.date ?: "N/A"
                } else {
                    rowModel.dateFormatted
                }
                StatementRow(
                    dateMs = dateMs,
                    dateStr = displayDate,
                    type = rowModel.type,
                    reference = rowModel.reference,
                    debit = rowModel.debit,
                    credit = rowModel.credit,
                    runningBalance = rowModel.runningBalance,
                    recordItem = recordItem,
                    infoText = rowModel.infoText
                )
            }.reversed()
        } else {
            buildStatementRows(customerName, openingBalance, filteredBills, filteredPayments, settlementMap)
        }
    }

    val totalBilled = remember(filteredBills, ledgerData, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            ledgerData.summary.totalBilled
        } else {
            filteredBills.sumOf { it.grandTotal }
        }
    }
    val totalPaid = remember(filteredPayments, ledgerData, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            ledgerData.summary.totalPaid
        } else {
            filteredPayments.filter { it.type.uppercase() == "PAYMENT" }.sumOf { it.amount }
        }
    }
    val totalCredits = remember(filteredPayments, ledgerData, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            ledgerData.summary.totalCredits
        } else {
            filteredPayments.filter { it.type.uppercase() == "CREDIT_NOTE" }.sumOf { it.creditAmount }
        }
    }
    val totalCollected = remember(totalPaid, totalCredits, ledgerData, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            ledgerData.summary.totalCollected
        } else {
            totalPaid + totalCredits
        }
    }
    val amountDue = remember(totalBilled, openingBalance, totalCollected, ledgerData, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            ledgerData.summary.currentDue
        } else {
            totalBilled + openingBalance - totalCollected
        }
    }
    val paidPercent = remember(totalBilled, openingBalance, amountDue, ledgerData, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            ledgerData.summary.paidPercent
        } else {
            val totalPurchases = totalBilled + if (openingBalance > 0) openingBalance else 0.0
            if (totalPurchases > 0) {
                val settled = (totalPurchases - amountDue).coerceAtLeast(0.0)
                ((settled / totalPurchases) * 100).toInt().coerceIn(0, 100)
            } else 100
        }
    }
    val agingBreakdown = remember(ledgerData, filteredBills, settlementMap, openingBalance, selectedDateFilter) {
        if (selectedDateFilter == DateFilterPeriod.ALL && ledgerData?.summary != null) {
            val s = ledgerData.summary
            AgingBreakdown(s.ageing0to7, s.ageing8to15, s.ageing16to30, s.ageingOver30)
        } else {
            var a0 = 0.0
            var a8 = 0.0
            var a16 = 0.0
            var a30 = if (openingBalance > 0) openingBalance else 0.0
            filteredBills.forEach { b ->
                val info = settlementMap[b.id]
                if (info != null && !info.isSettled) {
                    when {
                        info.days <= 7 -> a0 += b.grandTotal
                        info.days <= 15 -> a8 += b.grandTotal
                        info.days <= 30 -> a16 += b.grandTotal
                        else -> a30 += b.grandTotal
                    }
                }
            }
            AgingBreakdown(a0, a8, a16, a30)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(customerName, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Ledger Statement", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showShareMenu = true }) {
                        Icon(Icons.Default.Share, "Share")
                    }
                    IconButton(onClick = { folderPickerLauncher.launch(null) }) {
                        Icon(Icons.Default.Folder, "Export")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .nestedScroll(nestedScrollConnection)
        ) {
            // --- Collapsible Header ---
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest,
                shape = RoundedCornerShape(bottomStart = 24.dp, bottomEnd = 24.dp),
                tonalElevation = 2.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    AnimatedVisibility(
                        visible = isHeaderVisible,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut()
                    ) {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                KpiStatCard(
                                    title = if (amountDue < 0) "Credit Balance" else "Total Due",
                                    value = "₹${"%,.0f".format(abs(amountDue))}",
                                    icon = Icons.Default.AccountBalanceWallet,
                                    containerColor = if (amountDue < 0) Color(0xFFE8F5E9) else MaterialTheme.colorScheme.errorContainer,
                                    contentColor = if (amountDue < 0) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onErrorContainer,
                                    modifier = Modifier.weight(1f)
                                )
                                KpiStatCard(
                                    title = "Collected",
                                    value = "₹${"%,.0f".format(totalCollected)}",
                                    icon = Icons.Default.Payments,
                                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))

                            // Settlement Progress
                            Column(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Settlement Progress",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        text = "$paidPercent% Settled",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                LinearProgressIndicator(
                                    progress = { (paidPercent / 100f).coerceIn(0f, 1f) },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(6.dp)
                                        .clip(RoundedCornerShape(3.dp)),
                                    color = MaterialTheme.colorScheme.primary,
                                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                                )
                            }

                            // Receivables Aging Breakdown (when outstanding due > 0)
                            if (amountDue > 0) {
                                Spacer(modifier = Modifier.height(8.dp))
                                ReceivablesAgingCard(aging = agingBreakdown)
                            }

                            Spacer(modifier = Modifier.height(12.dp))
                        }
                    }

                    PrimaryTabRow(
                        selectedTabIndex = selectedTab.ordinal,
                        containerColor = Color.Transparent,
                        divider = {}
                    ) {
                        LedgerViewTab.values().forEach { tab ->
                            Tab(
                                selected = selectedTab == tab,
                                onClick = { selectedTab = tab },
                                text = { Text(tab.title, fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                                icon = { Icon(tab.icon, null, Modifier.size(16.dp)) }
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Date Selection Ribbon
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DateFilterPeriod.values().forEach { period ->
                    FilterChip(
                        selected = selectedDateFilter == period,
                        onClick = { selectedDateFilter = period },
                        label = { Text(period.label, fontSize = 11.sp) }
                    )
                }
            }

            // Transaction List
            Box(modifier = Modifier.weight(1f)) {
                if (isLoading && filteredBills.isEmpty() && filteredPayments.isEmpty()) {
                    Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
                } else {
                    when (selectedTab) {
                        LedgerViewTab.BILLS -> BillsOnlyFeed(filteredBills, settlementMap) {
                            selectedRecordItem = it; showActionBottomSheet = true
                        }
                        LedgerViewTab.PAYMENTS -> PaymentsOnlyFeed(customerName, openingBalance, filteredPayments) {
                            selectedRecordItem = it; showActionBottomSheet = true
                        }
                        LedgerViewTab.BOTH -> RunningStatementFeed(statementRows) {
                            selectedRecordItem = it; showActionBottomSheet = true
                        }
                        LedgerViewTab.TIMELINE -> TimelineStreamFeed(customerName, openingBalance, filteredBills, filteredPayments) {
                            selectedRecordItem = it; showActionBottomSheet = true
                        }
                    }
                }
            }
        }
    }

    // --- Action Sheet & Dialogs ---
    if (showActionBottomSheet && selectedRecordItem != null) {
        ModalBottomSheet(onDismissRequest = { showActionBottomSheet = false }) {
            DetailedRecordActionSheet(
                item = selectedRecordItem!!,
                customerName = customerName,
                onAction = { showActionBottomSheet = false },
                viewModel = billingViewModel,
                onPreview = { bytes, title ->
                    previewBytes = bytes; previewTitle = title; showPreviewDialog = true
                },
                onAttachment = { base64 ->
                    attachmentBase64 = base64; showAttachmentDialog = true
                },
                onDelete = { type, id ->
                    deleteItemType = type; deleteItemId = id; showDeleteConfirmDialog = true
                },
                onEditOpening = { newOpeningBalanceInput = openingBalance.toString(); showEditOpeningBalanceDialog = true },
                onEditDate = {
                    editDateTargetItem = selectedRecordItem
                    editDateInput = when (val i = selectedRecordItem) {
                        is LedgerRecordItem.BillRecord -> i.bill.date
                        is LedgerRecordItem.PaymentItem -> i.payment.paymentDate
                        else -> ""
                    }
                    showEditDateDialog = true
                }
            )
        }
    }

    if (showShareMenu) {
        ShareLedgerDialog(customerName, customerId, filteredBills, filteredPayments, openingBalance) { showShareMenu = false }
    }

    if (showEditDateDialog && editDateTargetItem != null) {
        EditDateDialog(
            initialDate = editDateInput,
            onDismiss = { showEditDateDialog = false },
            onSave = { newDate ->
                val targetId = currentContact?.id ?: customerId
                val item = editDateTargetItem!!
                if (item is LedgerRecordItem.BillRecord) {
                    billingViewModel.updateBillDate(item.bill.id, newDate) { s, m ->
                        if (s) fetchDetailedLedger(targetId)
                        Toast.makeText(context, m ?: if (s) "Updated" else "Failed", Toast.LENGTH_SHORT).show()
                    }
                } else if (item is LedgerRecordItem.PaymentItem) {
                    billingViewModel.updatePaymentDate(item.payment.id, newDate) { s, m ->
                        if (s) fetchDetailedLedger(targetId)
                        Toast.makeText(context, m ?: if (s) "Updated" else "Failed", Toast.LENGTH_SHORT).show()
                    }
                }
                showEditDateDialog = false
            }
        )
    }

    if (showEditOpeningBalanceDialog) {
        EditOpeningBalanceDialog(
            initialVal = newOpeningBalanceInput,
            onDismiss = { showEditOpeningBalanceDialog = false },
            onSave = { newVal ->
                val targetId = currentContact?.id ?: customerId
                billingViewModel.updateOpeningBalance(targetId, newVal) { s, m ->
                    if (s) {
                        billingViewModel.loadBillingData()
                        fetchDetailedLedger(targetId)
                    }
                    Toast.makeText(context, m ?: if (s) "Updated" else "Failed", Toast.LENGTH_SHORT).show()
                }
                showEditOpeningBalanceDialog = false
            }
        )
    }

    if (showDeleteConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmDialog = false },
            title = { Text("Delete $deleteItemType") },
            text = { Text("Are you sure? This cannot be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        val targetId = currentContact?.id ?: customerId
                        if (deleteItemType == "Bill") {
                            billingViewModel.deleteBill(deleteItemId) { s, m ->
                                if (s) fetchDetailedLedger(targetId)
                                Toast.makeText(context, m ?: "Result: $s", Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            billingViewModel.deletePayment(deleteItemId) { s, m ->
                                if (s) fetchDetailedLedger(targetId)
                                Toast.makeText(context, m ?: "Result: $s", Toast.LENGTH_SHORT).show()
                            }
                        }
                        showDeleteConfirmDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirmDialog = false }) { Text("Cancel") } }
        )
    }

    if (showPreviewDialog && previewBytes != null) {
        ZoomablePreviewDialog(previewTitle, previewBytes!!) { showPreviewDialog = false }
    }

    if (showAttachmentDialog && attachmentBase64 != null) {
        ZoomableAttachmentDialog(attachmentBase64!!) { showAttachmentDialog = false }
    }
}

// ==================== LIST FEEDS ====================

@Composable
fun RunningStatementFeed(
    rows: List<StatementRow>,
    onItemClick: (LedgerRecordItem) -> Unit
) {
    if (rows.isEmpty()) {
        Box(Modifier.fillMaxSize(), Alignment.Center) { Text("No statement records", color = MaterialTheme.colorScheme.outline) }
    } else {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            itemsIndexed(rows) { _, row ->
                StatementRowCard(row) { onItemClick(row.recordItem) }
            }
        }
    }
}

@Composable
fun BillsOnlyFeed(
    bills: List<Bill>,
    settlementMap: Map<String, FifoSettlementCalculator.SettlementInfo>,
    onItemClick: (LedgerRecordItem) -> Unit
) {
    if (bills.isEmpty()) {
        Box(Modifier.fillMaxSize(), Alignment.Center) { Text("No bills found", color = MaterialTheme.colorScheme.outline) }
    } else {
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            itemsIndexed(bills) { _, bill ->
                BillRecordCard(bill, settlementMap[bill.id]) { onItemClick(LedgerRecordItem.BillRecord(bill, settlementMap[bill.id])) }
            }
        }
    }
}

@Composable
fun PaymentsOnlyFeed(
    name: String,
    opening: Double,
    payments: List<PaymentRecord>,
    onItemClick: (LedgerRecordItem) -> Unit
) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (opening != 0.0) {
            item { OpeningBalanceCard(opening) { onItemClick(LedgerRecordItem.OpeningBalanceRecord(name, opening)) } }
        }
        if (payments.isEmpty() && opening == 0.0) {
            item { Box(Modifier.fillMaxWidth().padding(32.dp), Alignment.Center) { Text("No payments found") } }
        }
        itemsIndexed(payments) { _, p ->
            PaymentRecordCard(p) { onItemClick(LedgerRecordItem.PaymentItem(p)) }
        }
    }
}

@Composable
fun TimelineStreamFeed(
    name: String,
    opening: Double,
    bills: List<Bill>,
    payments: List<PaymentRecord>,
    onItemClick: (LedgerRecordItem) -> Unit
) {
    val items = remember(bills, payments) {
        val l = mutableListOf<Pair<Long, LedgerRecordItem>>()
        bills.forEach { l.add((FifoSettlementCalculator.parseDate(it.date)?.time ?: 0L) to LedgerRecordItem.BillRecord(it, null)) }
        payments.forEach { l.add((FifoSettlementCalculator.parseDate(it.paymentDate.ifBlank { it.createdAt })?.time ?: 0L) to LedgerRecordItem.PaymentItem(it)) }
        l.sortedByDescending { it.first }
    }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (opening != 0.0) item { OpeningBalanceCard(opening) { onItemClick(LedgerRecordItem.OpeningBalanceRecord(name, opening)) } }
        itemsIndexed(items) { _, pair ->
            when (val i = pair.second) {
                is LedgerRecordItem.BillRecord -> BillRecordCard(i.bill, null) { onItemClick(i) }
                is LedgerRecordItem.PaymentItem -> PaymentRecordCard(i.payment) { onItemClick(i) }
                else -> {}
            }
        }
    }
}

// ==================== CARDS ====================

@Composable
fun BillRecordCard(
    bill: Bill,
    settlement: FifoSettlementCalculator.SettlementInfo?,
    onClick: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    OutlinedCard(
        onClick = { expanded = !expanded },
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(bill.billNumber.ifEmpty { "INV-${bill.id}" }, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(bill.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                PixelStatusBadge(bill.status)
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Text("Billed Amount", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("₹${"%,.2f".format(bill.grandTotal)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
            }

            if (settlement != null) {
                Spacer(Modifier.height(6.dp))
                Surface(
                    color = if (settlement.isSettled) Color(0xFFE8F5E9) else MaterialTheme.colorScheme.surfaceVariant,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = if (settlement.isSettled) "Settled in ${settlement.days}d" else "${settlement.days}d outstanding",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (settlement.isSettled) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                    )
                }
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f)
                        ) { Text("Open") }
                        TextButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f)
                        ) { Text("Edit") }
                        TextButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                        ) { Text("Delete") }
                    }
                }
            }
        }
    }
}

@Composable
fun PaymentRecordCard(
    p: PaymentRecord,
    onClick: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val isCredit = p.safeType.contains("CREDIT", ignoreCase = true)
    OutlinedCard(
        onClick = { expanded = !expanded },
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(p.referenceNo ?: (if (isCredit) "Credit Note" else "Payment"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(com.example.macosbusinesssuite.util.DateTimeUtils.formatDisplayDate(p.safePaymentDate), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                PixelStatusBadge(if (isCredit) "CREDIT" else p.safePaymentMedium)
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Text(if (isCredit) "Credit Value" else "Paid Amount", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("₹${"%,.2f".format(p.effectiveAmount)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = Color(0xFF2E7D32))
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f)
                        ) { Text("Open") }
                        TextButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f)
                        ) { Text("Receipt") }
                        TextButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                        ) { Text("Delete") }
                    }
                }
            }
        }
    }
}

@Composable
fun StatementRowCard(
    row: StatementRow,
    onClick: () -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val isDebit = row.debit > 0
    val isCredit = row.credit > 0
    val isOpening = row.type.contains("OPENING", ignoreCase = true)
    val isInvoice = row.type.contains("BILL", ignoreCase = true) || row.type.contains("INVOICE", ignoreCase = true)
    val isCreditNote = row.type.contains("CREDIT", ignoreCase = true)

    OutlinedCard(
        onClick = { expanded = !expanded },
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PixelStatusBadge(
                        status = when {
                            isOpening -> "OPENING"
                            isInvoice -> "INVOICE"
                            isCreditNote -> "CREDIT"
                            else -> "PAYMENT"
                        }
                    )
                    Text(
                        text = row.reference.ifBlank { if (isOpening) "Opening Balance" else "Record" },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
                Text(
                    text = row.dateStr,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (row.infoText.isNotBlank() && row.infoText != "-") {
                Spacer(Modifier.height(4.dp))
                Surface(
                    shape = RoundedCornerShape(4.dp),
                    color = if (row.infoText.contains("SETTLED", ignoreCase = true)) {
                        Color(0xFFE8F5E9)
                    } else if (row.infoText.contains("OUTSTANDING", ignoreCase = true)) {
                        MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    modifier = Modifier.padding(vertical = 2.dp)
                ) {
                    Text(
                        text = row.infoText,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (row.infoText.contains("SETTLED", ignoreCase = true)) {
                            Color(0xFF2E7D32)
                        } else if (row.infoText.contains("OUTSTANDING", ignoreCase = true)) {
                            MaterialTheme.colorScheme.onErrorContainer
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                Column {
                    if (isDebit) {
                        Text(
                            "+₹${"%,.2f".format(row.debit)}",
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleSmall
                        )
                    }
                    if (isCredit) {
                        Text(
                            "-₹${"%,.2f".format(row.credit)}",
                            color = Color(0xFF2E7D32),
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleSmall
                        )
                    }
                    if (!isDebit && !isCredit) {
                        Text("₹0.00", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.outline)
                    }
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text("Running Bal", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "₹${"%,.2f".format(row.runningBalance)}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Black,
                        color = if (row.runningBalance > 0) MaterialTheme.colorScheme.onSurface else Color(0xFF2E7D32)
                    )
                }
            }

            AnimatedVisibility(
                visible = expanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f)
                        ) { Text("Open") }
                        TextButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f)
                        ) { Text("Edit") }
                        TextButton(
                            onClick = onClick,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                        ) { Text("Delete") }
                    }
                }
            }
        }
    }
}

@Composable
fun OpeningBalanceCard(amount: Double, onClick: () -> Unit) {
    OutlinedCard(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.AccountBalance, null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Opening Balance", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text("Brought forward from start", style = MaterialTheme.typography.bodySmall)
            }
            Text("₹${"%,.0f".format(amount)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
fun ReceivablesAgingCard(
    aging: AgingBreakdown,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text(
                text = "RECEIVABLES AGING BREAKDOWN",
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                AgingPill("0-7d", aging.d0to7, Color(0xFF2E7D32), modifier = Modifier.weight(1f))
                AgingPill("8-15d", aging.d8to15, Color(0xFF0288D1), modifier = Modifier.weight(1f))
                AgingPill("16-30d", aging.d16to30, Color(0xFFF57C00), modifier = Modifier.weight(1f))
                AgingPill(">30d", aging.over30, MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun AgingPill(
    label: String,
    amount: Double,
    tint: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = label,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = if (amount > 0) "₹${"%,.0f".format(amount)}" else "-",
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            color = if (amount > 0) tint else MaterialTheme.colorScheme.outline
        )
    }
}

// ==================== ACTIONS & DIALOGS ====================

@Composable
fun DetailedRecordActionSheet(
    item: LedgerRecordItem,
    customerName: String,
    onAction: () -> Unit,
    viewModel: BillingViewModel,
    onPreview: (ByteArray, String) -> Unit,
    onAttachment: (String) -> Unit,
    onDelete: (String, String) -> Unit,
    onEditOpening: () -> Unit,
    onEditDate: () -> Unit
) {
    val context = LocalContext.current
    Column(Modifier.padding(16.dp).navigationBarsPadding()) {
        val title = when (item) {
            is LedgerRecordItem.BillRecord -> "Bill ${item.bill.billNumber}"
            is LedgerRecordItem.PaymentItem -> "Payment ${item.payment.referenceNo ?: item.payment.id}"
            is LedgerRecordItem.OpeningBalanceRecord -> "Opening Balance"
        }
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))

        when (item) {
            is LedgerRecordItem.BillRecord -> {
                ListItem(
                    headlineContent = { Text("View Preview") },
                    leadingContent = { Icon(Icons.Default.Visibility, null) },
                    modifier = Modifier.clickable {
                        onAction()
                        viewModel.fetchPreviewBytes("invoice", item.bill.billNumber, customerName) { b, e ->
                            if (b != null) onPreview(b, "Invoice ${item.bill.billNumber}")
                            else Toast.makeText(context, e ?: "Error", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
                ListItem(
                    headlineContent = { Text("Export PDF") },
                    leadingContent = { Icon(Icons.Default.Download, null) },
                    modifier = Modifier.clickable {
                        onAction()
                        viewModel.exportPdfBytes("invoice", item.bill.billNumber, customerName) { b, e ->
                            if (b != null) sharePdfFile(context, "Invoice-${item.bill.billNumber}.pdf", b)
                        }
                    }
                )
                ListItem(
                    headlineContent = { Text("Edit Date") },
                    leadingContent = { Icon(Icons.Default.Edit, null) },
                    modifier = Modifier.clickable { onAction(); onEditDate() }
                )
                ListItem(
                    headlineContent = { Text("Delete Bill", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable { onAction(); onDelete("Bill", item.bill.id) }
                )
            }
            is LedgerRecordItem.PaymentItem -> {
                ListItem(
                    headlineContent = { Text("View Receipt") },
                    leadingContent = { Icon(Icons.Default.Visibility, null) },
                    modifier = Modifier.clickable {
                        onAction()
                        val type = if (item.payment.type.uppercase() == "CREDIT_NOTE") "credit-note" else "payment"
                        viewModel.fetchPreviewBytes(type, item.payment.id, customerName) { b, e ->
                            if (b != null) onPreview(b, "Receipt")
                        }
                    }
                )
                if (!item.payment.attachmentData.isNullOrBlank()) {
                    ListItem(
                        headlineContent = { Text("View Attachment") },
                        leadingContent = { Icon(Icons.Default.Image, null) },
                        modifier = Modifier.clickable { onAction(); onAttachment(item.payment.attachmentData) }
                    )
                }
                ListItem(
                    headlineContent = { Text("Delete Payment", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable { onAction(); onDelete("Payment", item.payment.id) }
                )
            }
            is LedgerRecordItem.OpeningBalanceRecord -> {
                ListItem(
                    headlineContent = { Text("Edit Opening Balance") },
                    leadingContent = { Icon(Icons.Default.Edit, null) },
                    modifier = Modifier.clickable { onAction(); onEditOpening() }
                )
            }
        }
    }
}

@Composable
fun ShareLedgerDialog(
    name: String,
    id: String,
    bills: List<Bill>,
    payments: List<PaymentRecord>,
    opening: Double,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val totalBilled = bills.sumOf { it.grandTotal }
    val totalPaid = payments.filter { it.type.uppercase() == "PAYMENT" }.sumOf { it.amount }
    val totalCredits = payments.filter { it.type.uppercase() == "CREDIT_NOTE" }.sumOf { it.creditAmount }
    val amountDue = totalBilled + opening - (totalPaid + totalCredits)
    val targetId = id.ifBlank { name }
    val shareUrl = "https://mac.faizal.uk/customer-ledger.html?id=$targetId"
    val balStr = if (amountDue < 0) "Credit Balance: ₹${"%,.2f".format(abs(amountDue))}" else "Amount Due: ₹${"%,.2f".format(amountDue)}"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Share Ledger Statement") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = {
                        val msg = "Hello $name!\n\nSummary Statement:\n• $balStr\n\nView details: $shareUrl"
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/?text=${Uri.encode(msg)}"))
                        context.startActivity(intent)
                        onDismiss()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366))
                ) { Text("WhatsApp Summary") }
                OutlinedButton(
                    onClick = {
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "Ledger Statement for $name: $shareUrl")
                        }
                        context.startActivity(Intent.createChooser(intent, "Share Link"))
                        onDismiss()
                    },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Share Link") }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }
    )
}

@Composable
fun EditDateDialog(initialDate: String, onDismiss: () -> Unit, onSave: (String) -> Unit) {
    var date by remember { mutableStateOf(initialDate) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Date") },
        text = { OutlinedTextField(value = date, onValueChange = { date = it }, label = { Text("YYYY-MM-DD") }) },
        confirmButton = { Button(onClick = { onSave(date) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun EditOpeningBalanceDialog(initialVal: String, onDismiss: () -> Unit, onSave: (Double) -> Unit) {
    var value by remember { mutableStateOf(initialVal) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Opening Balance") },
        text = { OutlinedTextField(value = value, onValueChange = { value = it }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)) },
        confirmButton = { Button(onClick = { value.toDoubleOrNull()?.let(onSave) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
fun ZoomablePreviewDialog(title: String, bytes: ByteArray, onDismiss: () -> Unit) {
    val bitmap = remember(bytes) { try { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) } catch (e: Exception) { null } }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize().padding(16.dp), shape = RoundedCornerShape(16.dp)) {
            Column {
                Row(Modifier.fillMaxWidth().padding(16.dp), Arrangement.SpaceBetween, Alignment.CenterVertically) {
                    Text(title, fontWeight = FontWeight.Bold); IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, null) }
                }
                Box(Modifier.weight(1f).fillMaxWidth().background(Color.Gray), Alignment.Center) {
                    bitmap?.let { ZoomableImage(it) } ?: Text("Preview error")
                }
            }
        }
    }
}

@Composable
fun ZoomableAttachmentDialog(base64: String, onDismiss: () -> Unit) {
    val bitmap = remember(base64) { try { val b = Base64.decode(base64.substringAfter(","), Base64.DEFAULT); BitmapFactory.decodeByteArray(b, 0, b.size) } catch (e: Exception) { null } }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = Color.Black) {
            Column {
                Row(Modifier.fillMaxWidth().padding(16.dp), Arrangement.End) { IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, null, tint = Color.White) } }
                Box(Modifier.weight(1f).fillMaxWidth(), Alignment.Center) { bitmap?.let { ZoomableImage(it) } }
            }
        }
    }
}

@Composable
fun ZoomableImage(bitmap: Bitmap) {
    var scale by remember { mutableFloatStateOf(1f) }; var pan by remember { mutableStateOf(Offset.Zero) }
    Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTransformGestures { _, p, s, _ -> scale *= s; pan += p } }, Alignment.Center) {
        Image(bitmap.asImageBitmap(), null, Modifier.graphicsLayer(scaleX = scale.coerceIn(1f, 5f), scaleY = scale.coerceIn(1f, 5f), translationX = pan.x, translationY = pan.y))
    }
}

// ==================== HELPERS ====================

private fun buildStatementRows(
    name: String,
    opening: Double,
    bills: List<Bill>,
    pmts: List<PaymentRecord>,
    settlement: Map<String, FifoSettlementCalculator.SettlementInfo>
): List<StatementRow> {
    val items = mutableListOf<Pair<Long, LedgerRecordItem>>()
    bills.forEach { items.add((FifoSettlementCalculator.parseDate(it.date)?.time ?: 0L) to LedgerRecordItem.BillRecord(it, settlement[it.id])) }
    pmts.forEach { items.add((FifoSettlementCalculator.parseDate(it.paymentDate.ifBlank { it.createdAt })?.time ?: 0L) to LedgerRecordItem.PaymentItem(it)) }
    
    val sorted = items.sortedBy { it.first }
    val rows = mutableListOf<StatementRow>()
    var balance = opening
    if (opening != 0.0) rows.add(StatementRow(0, "START", "OPENING", "Opening Balance", if(opening>0) opening else 0.0, if(opening<0) abs(opening) else 0.0, balance, LedgerRecordItem.OpeningBalanceRecord(name, opening), "-"))
    
    sorted.forEach { (ms, item) ->
        when (item) {
            is LedgerRecordItem.BillRecord -> {
                balance += item.bill.grandTotal
                val sInfo = item.settlementInfo
                val infoText = if (sInfo != null) {
                    if (sInfo.isSettled) "SETTLED IN ${sInfo.days}D" else "${sInfo.days}D OUTSTANDING"
                } else "-"
                val ref = item.bill.billNumber.ifBlank { "INV-${item.bill.id}" }
                rows.add(StatementRow(ms, item.bill.date, "INVOICE", ref, item.bill.grandTotal, 0.0, balance, item, infoText))
            }
            is LedgerRecordItem.PaymentItem -> {
                val isCr = item.payment.type.uppercase() == "CREDIT_NOTE"
                val amt = if (isCr) item.payment.creditAmount else item.payment.amount
                balance -= amt
                val ref = item.payment.referenceNo?.takeIf { it.isNotBlank() } ?: if (isCr) "Credit Note" else "Payment"
                rows.add(StatementRow(ms, item.payment.paymentDate.ifBlank { item.payment.createdAt ?: "" }, if (isCr) "CREDIT NOTE" else "PAYMENT", ref, 0.0, amt, balance, item, "-"))
            }
            is LedgerRecordItem.OpeningBalanceRecord -> {
                // no-op: opening balance rows are already inserted above
            }
        }
    }
    return rows.reversed()
}

private fun filterBillsByPeriod(bills: List<Bill>, p: DateFilterPeriod): List<Bill> {
    if (p == DateFilterPeriod.ALL) return bills
    val now = Calendar.getInstance()
    return bills.filter { b ->
        val date = FifoSettlementCalculator.parseDate(b.date) ?: return@filter true
        val cal = Calendar.getInstance().apply { time = date }
        when (p) {
            DateFilterPeriod.THIS_MONTH -> cal.get(Calendar.MONTH) == now.get(Calendar.MONTH) && cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            DateFilterPeriod.LAST_3_MONTHS -> ((now.get(Calendar.YEAR)-cal.get(Calendar.YEAR))*12 + now.get(Calendar.MONTH)-cal.get(Calendar.MONTH)) in 0..3
            DateFilterPeriod.LAST_6_MONTHS -> ((now.get(Calendar.YEAR)-cal.get(Calendar.YEAR))*12 + now.get(Calendar.MONTH)-cal.get(Calendar.MONTH)) in 0..6
            DateFilterPeriod.THIS_YEAR -> cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            DateFilterPeriod.ALL -> true
        }
    }
}

private fun filterPaymentsByPeriod(pmts: List<PaymentRecord>, p: DateFilterPeriod): List<PaymentRecord> {
    if (p == DateFilterPeriod.ALL) return pmts
    val now = Calendar.getInstance()
    return pmts.filter { pmt ->
        val date = FifoSettlementCalculator.parseDate(pmt.paymentDate.ifBlank { pmt.createdAt }) ?: return@filter true
        val cal = Calendar.getInstance().apply { time = date }
        when (p) {
            DateFilterPeriod.THIS_MONTH -> cal.get(Calendar.MONTH) == now.get(Calendar.MONTH) && cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            DateFilterPeriod.LAST_3_MONTHS -> ((now.get(Calendar.YEAR)-cal.get(Calendar.YEAR))*12 + now.get(Calendar.MONTH)-cal.get(Calendar.MONTH)) in 0..3
            DateFilterPeriod.LAST_6_MONTHS -> ((now.get(Calendar.YEAR)-cal.get(Calendar.YEAR))*12 + now.get(Calendar.MONTH)-cal.get(Calendar.MONTH)) in 0..6
            DateFilterPeriod.THIS_YEAR -> cal.get(Calendar.YEAR) == now.get(Calendar.YEAR)
            DateFilterPeriod.ALL -> true
        }
    }
}

internal fun sharePdfFile(c: Context, name: String, bytes: ByteArray) {
    try {
        val f = File(c.cacheDir, name); FileOutputStream(f).use { it.write(bytes) }
        val uri = FileProvider.getUriForFile(c, "${c.packageName}.fileprovider", f)
        c.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "application/pdf"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }, "Share PDF"))
    } catch (e: Exception) { Toast.makeText(c, "Error: ${e.message}", Toast.LENGTH_SHORT).show() }
}
