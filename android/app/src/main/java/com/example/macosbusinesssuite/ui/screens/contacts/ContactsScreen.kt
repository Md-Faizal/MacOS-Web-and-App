package com.example.macosbusinesssuite.ui.screens.contacts

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import com.example.macosbusinesssuite.ui.components.appMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Notes
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.example.macosbusinesssuite.data.model.Contact
import com.example.macosbusinesssuite.ui.components.PixelSearchBar
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.abs

fun isContactActive(contact: Contact): Boolean {
    val act = contact.active
    if (!act.isNullOrBlank()) {
        return act.equals("ACTIVE", ignoreCase = true) || act == "1" || act.equals("true", ignoreCase = true)
    }
    val st = contact.status
    if (!st.isNullOrBlank()) {
        return st.equals("Active", ignoreCase = true)
    }
    return false
}

fun formatDaysAgo(dateStr: String?): String {
    if (dateStr.isNullOrBlank()) return "None"
    return try {
        val cleanDate = dateStr.replace("T", " ").trim()
        val parsedDate: java.util.Date? = try {
            if (cleanDate.length >= 19) {
                SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).parse(cleanDate.take(19))
            } else if (cleanDate.length >= 10) {
                SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(cleanDate.take(10))
            } else null
        } catch (_: Exception) {
            try {
                SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(cleanDate.take(10))
            } catch (_: Exception) { null }
        }

        if (parsedDate != null) {
            val diffMs = System.currentTimeMillis() - parsedDate.time
            val days = (diffMs / (1000 * 60 * 60 * 24)).toInt()
            when {
                days <= 0 -> "Today"
                days == 1 -> "1d ago"
                else -> "${days}d ago"
            }
        } else "None"
    } catch (_: Exception) {
        "None"
    }
}

fun getDaysAgoCount(dateStr: String?): Int? {
    if (dateStr.isNullOrBlank()) return null
    return try {
        val cleanDate = dateStr.replace("T", " ").trim()
        val parsedDate: java.util.Date? = try {
            if (cleanDate.length >= 19) {
                SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).parse(cleanDate.take(19))
            } else if (cleanDate.length >= 10) {
                SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(cleanDate.take(10))
            } else null
        } catch (_: Exception) {
            try {
                SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(cleanDate.take(10))
            } catch (_: Exception) { null }
        }

        if (parsedDate != null) {
            val diffMs = System.currentTimeMillis() - parsedDate.time
            (diffMs / (1000 * 60 * 60 * 24)).toInt()
        } else null
    } catch (_: Exception) {
        null
    }
}

fun parseContactDate(dateStr: String?): java.util.Date? {
    if (dateStr.isNullOrBlank()) return null
    return try {
        val cleanDate = dateStr.replace("T", " ").trim()
        if (cleanDate.length >= 19) {
            SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).parse(cleanDate.take(19))
        } else if (cleanDate.length >= 10) {
            SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(cleanDate.take(10))
        } else null
    } catch (_: Exception) {
        try {
            SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).parse(dateStr.take(10))
        } catch (_: Exception) { null }
    }
}

fun isContactAtRisk(contact: Contact): Boolean {
    // 0. Exclude customers marked with excludeFromStats == 1
    if (contact.excludeFromStats == 1) return false

    // 1. Must have an outstanding due balance (> 0)
    if (contact.currentDue <= 0.0) return false

    // 2. At least 14 days or more have passed since the latest bill was issued
    val billDays = getDaysAgoCount(contact.lastBillDate) ?: return false
    if (billDays < 14) return false

    // 3. No payment made since that latest bill (or no payment made at all)
    val billDate = parseContactDate(contact.lastBillDate) ?: return false
    val pmtDate = parseContactDate(contact.lastPaymentDate) ?: return true

    // Payment was made on or before the bill date -> NO payment made AFTER the bill
    return pmtDate.time <= billDate.time
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun ContactsScreen(
    viewModel: MainViewModel,
    onSubPageToggle: (Boolean) -> Unit = {}
) {
    val contacts by viewModel.contacts.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val marqueeEnabled by viewModel.marqueeEnabled.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var selectedFilterTab by remember { mutableStateOf("All") }

    var selectedContactForDetails by remember { mutableStateOf<Contact?>(null) }
    var contactToEdit by remember { mutableStateOf<Contact?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    var apiErrorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(selectedContactForDetails, contactToEdit) {
        onSubPageToggle(selectedContactForDetails != null || contactToEdit != null)
    }

    // Auto-refresh contacts every time screen comes to foreground
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.loadContacts()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadContacts()
    }

    val filteredContacts = remember(contacts, searchQuery, selectedFilterTab) {
        contacts.filter { contact ->
            val matchesSearch = searchQuery.isEmpty() ||
                    contact.name.contains(searchQuery, ignoreCase = true) ||
                    (contact.phone?.contains(searchQuery, ignoreCase = true) == true) ||
                    (contact.email?.contains(searchQuery, ignoreCase = true) == true) ||
                    (contact.gstin?.contains(searchQuery, ignoreCase = true) == true)

            val statusStr = contact.status ?: (if (isContactActive(contact)) "Active" else "Inactive")

            val matchesFilter = when (selectedFilterTab) {
                "At-Risk" -> isContactAtRisk(contact)
                else -> true
            }

            matchesSearch && matchesFilter
        }.sortedBy { it.name.uppercase() }
    }

    val groupedContacts = remember(filteredContacts) {
        filteredContacts.groupBy {
            val firstChar = it.name.firstOrNull()?.uppercaseChar() ?: '#'
            if (firstChar.isLetter()) firstChar.toString() else "#"
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

    Scaffold(
        floatingActionButton = {
            if (selectedContactForDetails == null && !showAddDialog && contactToEdit == null) {
                com.example.macosbusinesssuite.ui.components.AutoCollapsingSquareFab(
                    label = "New Contact",
                    icon = Icons.Default.PersonAdd,
                    onClick = { showAddDialog = true }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(bottom = padding.calculateBottomPadding())) {
            PullToRefreshBox(
                isRefreshing = isLoading,
                onRefresh = { viewModel.loadContacts() },
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
                                .windowInsetsPadding(WindowInsets.statusBars)
                                .padding(bottom = 8.dp, start = 16.dp, end = 16.dp, top = 4.dp)
                        ) {
                            // 1. Page Selector Pill Bar
                            AnimatedVisibility(
                                visible = isPageSelectorVisible,
                                enter = androidx.compose.animation.expandVertically() + fadeIn(),
                                exit = androidx.compose.animation.shrinkVertically() + fadeOut()
                            ) {
                                Column {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(MaterialTheme.colorScheme.surface, CircleShape)
                                            .padding(4.dp),
                                        horizontalArrangement = Arrangement.SpaceEvenly
                                    ) {
                                        listOf(
                                            "All" to ("Directory" to Icons.Default.Group),
                                            "At-Risk" to ("At-Risk" to Icons.Default.Warning)
                                        ).forEach { (filterKey, info) ->
                                            val (title, icon) = info
                                            val isSelected = selectedFilterTab == filterKey
                                            Box(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .clip(CircleShape)
                                                    .background(
                                                        if (isSelected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent
                                                    )
                                                    .clickable { selectedFilterTab = filterKey }
                                                    .padding(vertical = 8.dp),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = icon,
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
                                                            text = title,
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
                                    Spacer(modifier = Modifier.height(8.dp))
                                }
                            }

                            // 2. Integrated PixelSearchBar
                            PixelSearchBar(
                                query = searchQuery,
                                onQueryChange = { searchQuery = it },
                                placeholder = "Search name, phone, GSTIN...",
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                AnimatedContent(
                    targetState = selectedFilterTab,
                    transitionSpec = {
                        val targetIndex = if (targetState == "At-Risk") 1 else 0
                        val initialIndex = if (initialState == "At-Risk") 1 else 0
                        slideInHorizontally(initialOffsetX = { if (targetIndex > initialIndex) it else -it }) + fadeIn() togetherWith
                                slideOutHorizontally(targetOffsetX = { if (targetIndex > initialIndex) -it else it }) + fadeOut()
                    },
                    modifier = Modifier.fillMaxSize()
                ) { targetTab ->
                    if (isLoading && contacts.isEmpty()) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator()
                        }
                    } else if (filteredContacts.isEmpty()) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                                shape = RoundedCornerShape(24.dp)
                            ) {
                                Column(
                                    modifier = Modifier.padding(24.dp),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Surface(
                                        shape = CircleShape,
                                        color = MaterialTheme.colorScheme.primaryContainer,
                                        modifier = Modifier.size(64.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.PersonSearch,
                                                contentDescription = null,
                                                modifier = Modifier.size(32.dp),
                                                tint = MaterialTheme.colorScheme.onPrimaryContainer
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text(
                                        text = if (searchQuery.isNotEmpty() || selectedFilterTab != "All") "No matching contacts" else "No contacts yet",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        textAlign = TextAlign.Center
                                    )
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        text = if (searchQuery.isNotEmpty() || selectedFilterTab != "All") "Try adjusting your search query or filter." else "Swipe down to pull refresh, or tap below to add a contact.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        textAlign = TextAlign.Center
                                    )
                                    Spacer(modifier = Modifier.height(20.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        OutlinedButton(onClick = { viewModel.loadContacts() }) {
                                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Refresh")
                                        }
                                        Button(onClick = { showAddDialog = true }) {
                                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("Add Contact")
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(bottom = 150.dp)
                        ) {
                            groupedContacts.forEach { (initial, contactsForInitial) ->
                                stickyHeader {
                                    Surface(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp),
                                        color = MaterialTheme.colorScheme.background.copy(alpha = 0.95f)
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 4.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Surface(
                                                shape = CircleShape,
                                                color = MaterialTheme.colorScheme.primaryContainer,
                                                shadowElevation = 2.dp,
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Text(
                                                        text = initial,
                                                        style = MaterialTheme.typography.titleSmall,
                                                        fontWeight = FontWeight.Black,
                                                        color = MaterialTheme.colorScheme.onPrimaryContainer
                                                    )
                                                }
                                            }

                                            Spacer(modifier = Modifier.width(10.dp))

                                            Text(
                                                text = "${contactsForInitial.size} ${if (contactsForInitial.size == 1) "contact" else "contacts"}",
                                                style = MaterialTheme.typography.labelMedium,
                                                fontWeight = FontWeight.SemiBold,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                            )

                                            Spacer(modifier = Modifier.width(12.dp))

                                            HorizontalDivider(
                                                modifier = Modifier.weight(1f),
                                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)
                                            )
                                        }
                                    }
                                }
                                items(contactsForInitial, key = { it.id }) { contact ->
                                    ContactListItem(
                                        contact = contact,
                                        onClick = { selectedContactForDetails = contact },
                                        marqueeEnabled = marqueeEnabled
                                    )
                                }
                            }
                            item {
                                com.example.macosbusinesssuite.ui.components.VibrantPageBottomFiller(
                                    title = "Client Network Synced",
                                    subtitle = "Customer ledgers, balances, and GST details verified.",
                                    icon = Icons.Default.PeopleAlt,
                                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                    badgeText = "✦ DIRECTORY ACTIVE",
                                    modifier = Modifier.padding(top = 12.dp)
                                )
                            }
                        }
                    }
                }
            }
        }

        // Full Screen Detail Overlay with Auto Refresh & Pull-to-Refresh
        AnimatedVisibility(
            visible = selectedContactForDetails != null,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            selectedContactForDetails?.let { contact ->
                val updatedContact = contacts.find { it.id == contact.id } ?: contact
                ContactDetailScreen(
                    contact = updatedContact,
                    isLoading = isLoading,
                    onRefresh = { viewModel.loadContacts() },
                    onDismiss = { selectedContactForDetails = null },
                    onEdit = {
                        selectedContactForDetails = null
                        contactToEdit = updatedContact
                    },
                    onDelete = {
                        viewModel.deleteContact(updatedContact.id) { success, err ->
                            if (success) {
                                selectedContactForDetails = null
                            } else {
                                apiErrorMessage = err ?: "Failed to delete contact."
                            }
                        }
                    },
                    marqueeEnabled = marqueeEnabled
                )
            }
        }

        // Material 3 Add / Edit Contact Form Modal
        if (showAddDialog || contactToEdit != null) {
            AddEditContactModal(
                existingContact = contactToEdit,
                onDismiss = {
                    showAddDialog = false
                    contactToEdit = null
                },
                onSave = { updatedContact ->
                    if (contactToEdit != null) {
                        viewModel.updateContact(updatedContact) { success, err ->
                            if (success) {
                                showAddDialog = false
                                contactToEdit = null
                            } else {
                                apiErrorMessage = err ?: "Failed to update contact."
                            }
                        }
                    } else {
                        viewModel.createContact(updatedContact) { success, err ->
                            if (success) {
                                showAddDialog = false
                            } else {
                                apiErrorMessage = err ?: "Failed to create contact."
                            }
                        }
                    }
                }
            )
        }

        // Error Alert Dialog to prevent silent failures
        if (apiErrorMessage != null) {
            AlertDialog(
                onDismissRequest = { apiErrorMessage = null },
                icon = { Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                title = { Text("API Error", fontWeight = FontWeight.Bold) },
                text = { Text(apiErrorMessage ?: "An unexpected error occurred.") },
                confirmButton = {
                    Button(onClick = { apiErrorMessage = null }) {
                        Text("OK")
                    }
                }
            )
        }
    }
}
}

fun formatCurrency(amount: Double?): String {
    val value = amount ?: 0.0
    return try {
        val formatter = java.text.NumberFormat.getCurrencyInstance(java.util.Locale("en", "IN"))
        formatter.format(value)
    } catch (_: Exception) {
        String.format(java.util.Locale.US, "₹ %,.2f", value)
    }
}

fun formatIndustrialDateTime(rawStr: String?): String {
    if (rawStr.isNullOrBlank()) return "N/A"
    return try {
        val clean = rawStr.replace("T", " ").trim()
        val inputFormats = listOf(
            java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US),
            java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US),
            java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
        )
        var date: java.util.Date? = null
        for (fmt in inputFormats) {
            try {
                date = fmt.parse(clean)
                if (date != null) break
            } catch (_: Exception) {}
        }
        if (date != null) {
            val outFmt = java.text.SimpleDateFormat("dd MMM yyyy, hh:mm a", java.util.Locale.US)
            outFmt.format(date)
        } else {
            rawStr
        }
    } catch (_: Exception) {
        rawStr
    }
}

private fun getGradientForContact(name: String): Brush {
    val gradients = listOf(
        listOf(Color(0xFF8E24AA), Color(0xFF3F51B5)), // Purple to Indigo
        listOf(Color(0xFF00897B), Color(0xFF43A047)), // Teal to Green
        listOf(Color(0xFFFB8C00), Color(0xFFE53935)), // Orange to Red
        listOf(Color(0xFF1E88E5), Color(0xFF00ACC1)), // Blue to Cyan
        listOf(Color(0xFFD81B60), Color(0xFF8E24AA)), // Pink to Purple
        listOf(Color(0xFFFFB300), Color(0xFFF57C00)), // Amber to Orange
        listOf(Color(0xFF303F9F), Color(0xFF512DA8)), // Indigo to Deep Purple
        listOf(Color(0xFFC2185B), Color(0xFF7B1FA2))  // Magenta to Purple
    )
    var hash = 0
    for (i in name.indices) {
        hash = name[i].code + ((hash shl 5) - hash)
    }
    val pair = gradients[kotlin.math.abs(hash) % gradients.size]
    return Brush.linearGradient(pair)
}

@Composable
fun ContactListItem(
    contact: Contact,
    onClick: () -> Unit,
    marqueeEnabled: Boolean = true
) {
    val initials = getInitials(contact.name)
    val avatarGradient = getGradientForContact(contact.name)
    val active = isContactActive(contact)

    val currentDueVal = contact.currentDue
    val lastBillAgo = formatDaysAgo(contact.lastBillDate)
    val lastPmtAgo = formatDaysAgo(contact.lastPaymentDate)

    Card(
        onClick = onClick,
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        border = androidx.compose.foundation.BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Top Row: Avatar + Name & Phone + Badges
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Vibrant Gradient Avatar Circle with shadow elevation
                Surface(
                    shape = CircleShape,
                    shadowElevation = 4.dp,
                    modifier = Modifier.size(48.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(avatarGradient),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 17.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = contact.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            maxLines = if (marqueeEnabled) 1 else 2,
                            overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .appMarquee(marqueeEnabled)
                        )

                        // Contact Type Pill Tag
                        val typeTag = contact.type ?: "Customer"
                        Surface(
                            color = if (typeTag.equals("Supplier", ignoreCase = true))
                                MaterialTheme.colorScheme.tertiaryContainer
                            else
                                MaterialTheme.colorScheme.secondaryContainer,
                            shape = CircleShape
                        ) {
                            Text(
                                text = typeTag.uppercase(),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                fontWeight = FontWeight.Bold,
                                color = if (typeTag.equals("Supplier", ignoreCase = true))
                                    MaterialTheme.colorScheme.onTertiaryContainer
                                else
                                    MaterialTheme.colorScheme.onSecondaryContainer,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(2.dp))

                    if (!contact.phone.isNullOrEmpty()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Default.Call,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = contact.phone,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else if (!contact.email.isNullOrEmpty()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                Icons.Default.Email,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = contact.email,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.width(6.dp))

                // Active / Inactive Pill Badge
                Surface(
                    color = if (active) Color(0xFFE8F5E9) else Color(0xFFFFEBEE),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(if (active) Color(0xFF2E7D32) else Color(0xFFC62828))
                        )
                        Text(
                            text = if (active) "ACTIVE" else "INACTIVE",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                            fontWeight = FontWeight.Bold,
                            color = if (active) Color(0xFF2E7D32) else Color(0xFFC62828)
                        )
                    }
                }
            }

            // Bottom Financial Ledger Container Card
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.45f),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Due Amount Container
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = if (currentDueVal > 0) Color(0xFFFFEBEE) else Color(0xFFE8F5E9)
                        ) {
                            Icon(
                                imageVector = if (currentDueVal > 0) Icons.Default.TrendingUp else Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = if (currentDueVal > 0) Color(0xFFC62828) else Color(0xFF2E7D32),
                                modifier = Modifier.padding(4.dp).size(14.dp)
                            )
                        }

                        Column {
                            Text(
                                text = "CURRENT DUE",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = formatCurrency(currentDueVal),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Black,
                                color = if (currentDueVal > 0) Color(0xFFD32F2F) else Color(0xFF2E7D32)
                            )
                        }
                    }

                    // Activity Metrics (Last Bill / Last Payment)
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "LAST BILL",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = lastBillAgo,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "LAST PAYMENT",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = lastPmtAgo,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ContactDetailScreen(
    contact: Contact,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    marqueeEnabled: Boolean = true
) {
    BackHandler { onDismiss() }

    LaunchedEffect(Unit) {
        onRefresh()
    }

    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val scrollOffset = scrollState.value.toFloat()

    val maxScroll = 400f
    val progress = (scrollOffset / maxScroll).coerceIn(0f, 1f)

    val avatarScale by animateFloatAsState(targetValue = 1f - (progress * 0.3f), label = "scale")
    val avatarAlpha by animateFloatAsState(targetValue = 1f - (progress * 0.5f), label = "alpha")
    val avatarOffsetY by animateFloatAsState(targetValue = -(progress * 150f), label = "offsetY")

    val initials = getInitials(contact.name)
    val baseColor = generateColorForContact(contact.name)

    // Solid Opaque Root Surface (Prevents directory list underneath from bleeding through)
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0.dp),
                topBar = {
                    TopAppBar(
                        title = { Text(if (progress > 0.8f) contact.name else "", fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.basicMarquee()) },
                        navigationIcon = {
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                            }
                        },
                        actions = {
                            IconButton(onClick = onEdit) {
                                Icon(Icons.Default.Edit, contentDescription = "Edit")
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.surface,
                            scrolledContainerColor = MaterialTheme.colorScheme.surface
                        )
                    )
                }
            ) { paddingValues ->
                PullToRefreshBox(
                    isRefreshing = isLoading,
                    onRefresh = onRefresh,
                    modifier = Modifier.fillMaxSize()
                ) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        // Vibrant Header Gradient Backdrop
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = paddingValues.calculateTopPadding())
                                .height(220.dp)
                                .background(
                                    Brush.verticalGradient(
                                        colors = listOf(
                                            baseColor,
                                            baseColor.copy(alpha = 0.3f)
                                        )
                                    )
                                )
                        )

                        // Fixed Background Avatar Banner
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = paddingValues.calculateTopPadding())
                                .height(200.dp)
                                .graphicsLayer {
                                    scaleX = avatarScale
                                    scaleY = avatarScale
                                    translationY = avatarOffsetY
                                    alpha = avatarAlpha
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(120.dp)
                                    .clip(CircleShape)
                                    .background(baseColor),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(text = initials, color = Color.White, fontSize = 48.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Scrollable Content Card
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(scrollState)
                                .padding(top = paddingValues.calculateTopPadding() + 200.dp)
                        ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                    ) {
                        Column(modifier = Modifier.padding(20.dp)) {
                            // Profile Header
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = contact.name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = if (marqueeEnabled) 1 else 2,
                                    overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                                    modifier = Modifier
                                        .weight(1f)
                                        .appMarquee(marqueeEnabled)
                                )
                                if (contact.excludeFromStats == 1) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.errorContainer,
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Text(
                                            "🚫 Excluded",
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onErrorContainer,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            // Action Buttons Row (All 8 Action Buttons from contacts.js <div class="contact-actions">)
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                val cleanPhone = contact.phone?.replace(Regex("[^0-9+]"), "")

                                // 1. Message (WhatsApp)
                                item {
                                    ActionButton(icon = Icons.AutoMirrored.Filled.Chat, label = "Message") {
                                        if (!cleanPhone.isNullOrEmpty()) {
                                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$cleanPhone"))
                                            context.startActivity(intent)
                                        }
                                    }
                                }
                                // 2. Call
                                item {
                                    ActionButton(icon = Icons.Default.Call, label = "Call") {
                                        if (!contact.phone.isNullOrEmpty()) {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${contact.phone}"))
                                            context.startActivity(intent)
                                        }
                                    }
                                }
                                // 3. Email (Only show if email is present)
                                if (!contact.email.isNullOrBlank()) {
                                    item {
                                        ActionButton(icon = Icons.Default.Email, label = "Email") {
                                            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${contact.email}"))
                                            context.startActivity(intent)
                                        }
                                    }
                                }
                                // 4. View Ledger
                                item {
                                    ActionButton(icon = Icons.AutoMirrored.Filled.Notes, label = "View Ledger") {
                                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://mac.faizal.uk/customer-ledger.html?id=${contact.id}"))
                                        context.startActivity(intent)
                                    }
                                }
                                // 5. Share Ledger
                                item {
                                    ActionButton(icon = Icons.Default.Share, label = "Share Ledger") {
                                        val intent = Intent(Intent.ACTION_SEND).apply {
                                            type = "text/plain"
                                            putExtra(Intent.EXTRA_TEXT, "Customer Ledger for ${contact.name}: https://mac.faizal.uk/customer-ledger.html?id=${contact.id}")
                                        }
                                        context.startActivity(Intent.createChooser(intent, "Share Ledger"))
                                    }
                                }
                                // 6. New Bill
                                item {
                                    ActionButton(icon = Icons.Default.Receipt, label = "New Bill") {
                                        android.widget.Toast.makeText(context, "New Bill for ${contact.name}", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                }
                                // 7. New Payment
                                item {
                                    ActionButton(icon = Icons.Default.AttachMoney, label = "New Payment") {
                                        android.widget.Toast.makeText(context, "Record Payment for ${contact.name}", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                }
                                // 8. Print Slip (Triggers native WebView print manager for Shipping Slip)
                                item {
                                    ActionButton(icon = Icons.Default.Print, label = "Print Slip") {
                                        printShippingSlip(context, contact)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(20.dp))

                            // Ledger Financial Metrics Summary - Industrial Standard Formatting
                            InfoSection("Financial & Ledger Status", Icons.Default.AccountBalanceWallet) {
                                InfoRow("Current Due", formatCurrency(contact.currentDue))
                                InfoRow("Last Bill Date", formatIndustrialDateTime(contact.lastBillDate))
                                InfoRow("Last Payment Date", formatIndustrialDateTime(contact.lastPaymentDate))
                                InfoRow("Opening Balance", formatCurrency(contact.openingBalance))
                            }

                            // Basic Info
                            if (!contact.phone.isNullOrEmpty() || !contact.email.isNullOrEmpty() || !contact.address.isNullOrEmpty()) {
                                InfoSection("Contact Information", Icons.Default.PermContactCalendar) {
                                    InfoRow("Mobile", contact.phone)
                                    InfoRow("Email", contact.email)
                                    InfoRow("Address", contact.address)
                                }
                            }

                            // Business Info
                            if (!contact.gstin.isNullOrEmpty() || !contact.licenceNo.isNullOrEmpty() || !contact.pan.isNullOrEmpty()) {
                                InfoSection("Business Information", Icons.Default.BusinessCenter) {
                                    InfoRow("GSTIN", contact.gstin)
                                    InfoRow("Licence No", contact.licenceNo)
                                    InfoRow("PAN", contact.pan)
                                }
                            }

                            // Sales Analytics Summary
                            InfoSection("Sales & Analytics", Icons.Default.Insights) {
                                InfoRow("Lifetime Sales", formatCurrency(contact.realTotalSales))
                                InfoRow("Average Sales", formatCurrency(contact.realAvgSales))
                                InfoRow("Favourite Product", contact.favoriteProduct)
                            }

                            // Preferences
                            InfoSection("System Preferences", Icons.Default.Settings) {
                                InfoRow("Transport", contact.transportPreference)
                                InfoRow("Exclude from Stats", if (contact.excludeFromStats == 1) "Yes" else "No")
                                InfoRow("Disable Duplex PDF", if (contact.disableDuplexExport == 1) "Yes" else "No")
                                InfoRow("Created Date", formatIndustrialDateTime(contact.createdAt))
                                if (!contact.lastActivity.isNullOrEmpty()) {
                                    InfoRow("Last Activity", formatIndustrialDateTime(contact.lastActivity))
                                }
                            }

                            // Status
                            InfoSection("Account Status", Icons.Default.CheckCircle) {
                                val active = isContactActive(contact)
                                InfoRow(
                                    label = "Status",
                                    value = if (active) "◆ ACTIVE" else "◇ INACTIVE",
                                    valueColor = if (active) Color(0xFF4CAF50) else Color(0xFFE53935)
                                )
                            }

                            // Notes
                            if (!contact.notes.isNullOrEmpty()) {
                                InfoSection("Notes", Icons.AutoMirrored.Filled.Notes) {
                                    Text(
                                        text = contact.notes,
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.padding(vertical = 4.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(24.dp))

                            // Delete Button
                            OutlinedButton(
                                onClick = onDelete,
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Icon(Icons.Default.Delete, contentDescription = null)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Delete Contact", fontWeight = FontWeight.Bold)
                            }

                            Spacer(modifier = Modifier.height(40.dp))
                        }
                    }
                }
            }
            }

            // Light mode status bar contrasting header box for notification bar visibility
            if (!androidx.compose.foundation.isSystemInDarkTheme()) {
                val sbHeight = androidx.compose.foundation.layout.WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
                val sdHeight = androidx.compose.foundation.layout.WindowInsets.safeDrawing.asPaddingValues().calculateTopPadding()
                val topInset = if (sbHeight > sdHeight) sbHeight else sdHeight
                val actualHeight = if (topInset > 0.dp) topInset else 48.dp

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(actualHeight)
                        .background(Color(0xFF121212))
                )
            }
        }
        }
    }
}

@Composable
fun ActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.primaryContainer,
            shadowElevation = 3.dp,
            modifier = Modifier.size(52.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    icon,
                    contentDescription = label,
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.size(22.dp)
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
fun InfoSection(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        border = androidx.compose.foundation.BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(bottom = 4.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    modifier = Modifier.size(28.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(15.dp)
                        )
                    }
                }

                Text(
                    text = title.uppercase(),
                    style = MaterialTheme.typography.titleSmall.copy(fontSize = 11.sp, letterSpacing = 0.5.sp),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Black
                )
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))

            content()
        }
    }
}

fun printShippingSlip(context: android.content.Context, contact: Contact) {
    val fromName = "UTKAL CHEMICAL AUSHADHALAYA"
    val fromAddress = "Beside Sai Hospital Annex, Mirkamalpatna, Mangalabagh, 753001"
    val fromPhone = "7749089400"

    val toName = contact.name
    val toAddress = if (!contact.address.isNullOrBlank()) contact.address else "No address provided"
    val toPhone = contact.phone ?: ""

    val htmlContent = """
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Shipping Slip - ${toName}</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            *, *:before, *:after { box-sizing: border-box; }
            html, body { 
              margin: 0; 
              padding: 0; 
              width: 210mm;
              height: 297mm;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .print-container { 
              width: 210mm; 
              height: 297mm; 
              background: #ffffff;
              margin: 0 auto;
              position: relative;
            }
            .shipping-slip { 
              width: 210mm; 
              height: 148.5mm; 
              padding: 10mm 15mm 0mm 15mm; 
              position: relative;
              display: flex;
              flex-direction: column;
            }
            .slip-border { 
              border: 4px solid #000000; 
              width: 180mm; 
              height: 126mm; 
              padding: 6mm 10mm; 
              display: flex; 
              flex-direction: column;
              justify-content: space-between;
              background: #ffffff;
              margin: 0 auto;
            }
            .slip-header { 
              text-align: center; 
              font-size: 20pt; 
              font-weight: 900; 
              border-bottom: 4px solid #000000; 
              margin-bottom: 4mm; 
              padding-bottom: 3mm;
              letter-spacing: 2px;
            }
            .slip-grid { 
              display: flex; 
              flex-direction: column; 
              flex: 1;
              justify-content: space-between;
            }
            .slip-to { 
              flex: 1;
            }
            .slip-from { 
              border-top: 1px solid #cccccc; 
              padding-top: 3mm;
              margin-top: 2mm;
            }
            .slip-label { 
              font-size: 11pt; 
              font-weight: bold; 
              color: #333333; 
              margin-bottom: 1.5mm;
              text-decoration: underline;
            }
            .slip-value { 
              font-size: 14pt; 
              margin-bottom: 1mm; 
              line-height: 1.25;
              color: #000000;
            }
            .slip-value.name { 
              font-size: 20pt; 
              font-weight: 900; 
              margin-bottom: 2mm;
              text-transform: uppercase;
              color: #000000;
            }
            .slip-value.address {
              font-size: 15pt;
              word-wrap: break-word;
            }
            .cutting-line {
              position: absolute;
              bottom: 3mm;
              left: 5mm;
              right: 5mm;
              border-bottom: 2px dashed #000000;
              height: 0;
              text-align: center;
            }
            .cutting-line span {
              position: absolute;
              top: -11pt;
              left: 50%;
              transform: translateX(-50%);
              background: #ffffff;
              padding: 0 8px;
              font-size: 16pt;
              line-height: 1;
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            <div class="shipping-slip">
              <div class="slip-border">
                <div class="slip-header">SHIPPING SLIP</div>
                <div class="slip-grid">
                  <div class="slip-to">
                    <div class="slip-label">TO:</div>
                    <div class="slip-value name">${toName}</div>
                    <div class="slip-value address">${toAddress}</div>
                    ${if (toPhone.isNotEmpty()) "<div class=\"slip-value\">Ph: ${toPhone}</div>" else ""}
                  </div>
                  <div class="slip-from">
                    <div class="slip-label">FROM:</div>
                    <div class="slip-value name">${fromName}</div>
                    <div class="slip-value">${fromAddress}</div>
                    <div class="slip-value">Ph: ${fromPhone}</div>
                  </div>
                </div>
              </div>
              <div class="cutting-line">
                <span>✂️</span>
              </div>
            </div>
          </div>
        </body>
      </html>
    """.trimIndent()

    try {
        val webView = android.webkit.WebView(context)
        webView.webViewClient = object : android.webkit.WebViewClient() {
            override fun onPageFinished(view: android.webkit.WebView, url: String) {
                val printManager = context.getSystemService(android.content.Context.PRINT_SERVICE) as android.print.PrintManager
                val printAdapter = webView.createPrintDocumentAdapter("Shipping_Slip_${contact.name.replace(" ", "_")}")
                val printAttributes = android.print.PrintAttributes.Builder()
                    .setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4)
                    .setMinMargins(android.print.PrintAttributes.Margins(0, 0, 0, 0))
                    .build()
                printManager.print("Shipping Slip - ${contact.name}", printAdapter, printAttributes)
            }
        }
        webView.loadDataWithBaseURL("https://localhost", htmlContent, "text/html", "UTF-8", null)
    } catch (e: Exception) {
        android.widget.Toast.makeText(context, "Failed to open print preview", android.widget.Toast.LENGTH_SHORT).show()
    }
}

@Composable
fun InfoRow(
    label: String,
    value: String?,
    valueColor: Color = MaterialTheme.colorScheme.onSurface
) {
    if (!value.isNullOrEmpty()) {
        val isLongValue = value.length > 22 || label.equals("Address", ignoreCase = true) || label.contains("Product", ignoreCase = true)

        if (isLongValue) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 5.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.SemiBold
                )
                Surface(
                    color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.45f),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = value,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = valueColor,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.45f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = value,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = valueColor,
                        textAlign = TextAlign.End,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }
        }
    }
}

private fun getInitials(name: String): String {
    return name
        .split(' ')
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .joinToString("")
        .take(2)
        .ifEmpty { "C" }
}

private fun generateColorForContact(name: String): Color {
    val colors = listOf(
        Color(0xFFD4516B), Color(0xFFFF9500), Color(0xFFAF52DE),
        Color(0xFF34C759), Color(0xFF0A84FF), Color(0xFFFF3B30),
        Color(0xFFFFCC00), Color(0xFFFF2D55)
    )
    var hash = 0
    for (i in name.indices) {
        hash = name[i].code + ((hash shl 5) - hash)
    }
    return colors[abs(hash) % colors.size]
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditContactModal(
    existingContact: Contact?,
    onDismiss: () -> Unit,
    onSave: (Contact) -> Unit
) {
    var name by remember { mutableStateOf(existingContact?.name ?: "") }
    var phone by remember { mutableStateOf(existingContact?.phone ?: "") }
    var email by remember { mutableStateOf(existingContact?.email ?: "") }
    var address by remember { mutableStateOf(existingContact?.address ?: "") }
    var gstin by remember { mutableStateOf(existingContact?.gstin ?: "") }
    var licenceNo by remember { mutableStateOf(existingContact?.licenceNo ?: "") }
    var pan by remember { mutableStateOf(existingContact?.pan ?: "") }
    var openingBalance by remember { mutableStateOf(existingContact?.openingBalance?.toString() ?: "0") }
    var transportPreference by remember { mutableStateOf(existingContact?.transportPreference ?: "") }
    var excludeFromStats by remember { mutableStateOf(existingContact?.excludeFromStats == 1) }
    var disableDuplexExport by remember { mutableStateOf(existingContact?.disableDuplexExport == 1) }
    var notes by remember { mutableStateOf(existingContact?.notes ?: "") }

    val initials = getInitials(name)
    val avatarColor = generateColorForContact(if (name.isBlank()) "Contact" else name)

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            if (existingContact != null) "Edit Contact" else "New Contact",
                            fontWeight = FontWeight.Bold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Close")
                        }
                    },
                    actions = {
                        TextButton(
                            onClick = {
                                if (name.isNotBlank()) {
                                    onSave(
                                        Contact(
                                            id = existingContact?.id ?: "",
                                            name = name.trim(),
                                            phone = phone.ifEmpty { null },
                                            email = email.ifEmpty { null },
                                            address = address.ifEmpty { null },
                                            gstin = gstin.ifEmpty { null },
                                            licenceNo = licenceNo.ifEmpty { null },
                                            pan = pan.ifEmpty { null },
                                            openingBalance = openingBalance.toDoubleOrNull() ?: 0.0,
                                            transportPreference = transportPreference.ifEmpty { null },
                                            excludeFromStats = if (excludeFromStats) 1 else 0,
                                            disableDuplexExport = if (disableDuplexExport) 1 else 0,
                                            notes = notes.ifEmpty { null },
                                            type = "Customer"
                                        )
                                    )
                                }
                            },
                            enabled = name.isNotBlank()
                        ) {
                            Text("Save", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        }
                    }
                )
            }
        ) { paddingValues ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header Hero Avatar Preview
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(avatarColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initials,
                            color = Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Column {
                        Text(
                            text = if (name.isBlank()) "Contact Name" else name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Live Contact Preview",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                // 1. Basic Information Section Card (Contact Type chips removed)
                FormSectionCard(title = "Basic Information", icon = Icons.Default.Person) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Full Name *") },
                        placeholder = { Text("e.g. John Doe") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Phone Number") },
                        placeholder = { Text("+91 00000 00000") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        label = { Text("Email Address") },
                        placeholder = { Text("email@example.com") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = { Text("Address") },
                        placeholder = { Text("123 Street, City") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // 2. Business Information Section Card
                FormSectionCard(title = "Business Information", icon = Icons.Default.BusinessCenter) {
                    OutlinedTextField(
                        value = gstin,
                        onValueChange = { gstin = it },
                        label = { Text("GSTIN Number") },
                        placeholder = { Text("e.g. 21AAAAA0000A1Z5") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = licenceNo,
                        onValueChange = { licenceNo = it },
                        label = { Text("Licence Number") },
                        placeholder = { Text("e.g. LIC001") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = pan,
                        onValueChange = { pan = it },
                        label = { Text("PAN Number") },
                        placeholder = { Text("e.g. ABCDE1234F") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // 3. Financial & Preferences Section Card
                FormSectionCard(title = "Financial & Preferences", icon = Icons.Default.AccountBalanceWallet) {
                    OutlinedTextField(
                        value = openingBalance,
                        onValueChange = { openingBalance = it },
                        label = { Text("Opening Balance (₹)") },
                        placeholder = { Text("0.00") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = transportPreference,
                        onValueChange = { transportPreference = it },
                        label = { Text("Transport Preference") },
                        placeholder = { Text("e.g. By Road, Air, Rail") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    // Exclude from Stats Switch
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Exclude from Statistics",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "Don't include this contact in global revenue or stats.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = excludeFromStats,
                            onCheckedChange = { excludeFromStats = it }
                        )
                    }

                    // Disable Duplex Export Switch
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Disable Duplex in Export PDF",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                "Turn off second-page payment instructions in PDFs.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Switch(
                            checked = disableDuplexExport,
                            onCheckedChange = { disableDuplexExport = it }
                        )
                    }
                }

                // 4. Additional Notes
                FormSectionCard(title = "Additional Notes", icon = Icons.AutoMirrored.Filled.Notes) {
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Notes") },
                        placeholder = { Text("Add any extra details...") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Bottom Action Buttons
                Button(
                    onClick = {
                        if (name.isNotBlank()) {
                            onSave(
                                Contact(
                                    id = existingContact?.id ?: "",
                                    name = name.trim(),
                                    phone = phone.ifEmpty { null },
                                    email = email.ifEmpty { null },
                                    address = address.ifEmpty { null },
                                    gstin = gstin.ifEmpty { null },
                                    licenceNo = licenceNo.ifEmpty { null },
                                    pan = pan.ifEmpty { null },
                                    openingBalance = openingBalance.toDoubleOrNull() ?: 0.0,
                                    transportPreference = transportPreference.ifEmpty { null },
                                    excludeFromStats = if (excludeFromStats) 1 else 0,
                                    disableDuplexExport = if (disableDuplexExport) 1 else 0,
                                    notes = notes.ifEmpty { null },
                                    type = "Customer"
                                )
                            )
                        }
                    },
                    enabled = name.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Save Contact", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }

                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Cancel")
                }

                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    }
}

@Composable
fun FormSectionCard(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.12f))
            content()
        }
    }
}
