package com.example.macosbusinesssuite.ui.screens.products

import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.ui.draw.clipToBounds
import com.example.macosbusinesssuite.ui.components.appMarquee
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.launch
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.activity.compose.BackHandler
import com.example.macosbusinesssuite.ui.components.VibrantPageBottomFiller
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.macosbusinesssuite.data.model.Category
import com.example.macosbusinesssuite.data.model.Product
import com.example.macosbusinesssuite.data.model.ProductBatch
import com.example.macosbusinesssuite.data.model.ProductVariant
import com.example.macosbusinesssuite.ui.components.AutoCollapsingSquareFab
import com.example.macosbusinesssuite.ui.components.PixelSearchBar
import com.example.macosbusinesssuite.ui.components.M3SyncStatusPill
import com.example.macosbusinesssuite.ui.components.m3ValueChangeHighlight
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.text.SimpleDateFormat
import java.util.Date
import java.util.TimeZone
import java.util.Locale
import java.util.Calendar

enum class ProductSubPage(val title: String, val icon: ImageVector) {
    ALL("Products", Icons.Outlined.Inventory2),
    CATEGORIES("Categories", Icons.Outlined.Category)
}

enum class ProductSortOption(val title: String) {
    ALPHA_AZ("Alphabetical (A-Z)"),
    ALPHA_ZA("Alphabetical (Z-A)"),
    TOP_SELLING("Top Selling"),
    RECENTLY_ADDED("Recently Added"),
    RECENTLY_SOLD("Recently Sold")
}

fun formatCurrency(amount: Double): String {
    return if (amount % 1.0 == 0.0) "₹${amount.toInt()}" else "₹${String.format(Locale.US, "%.2f", amount)}"
}

fun formatDateReadable(dateStr: String?): String {
    if (dateStr.isNullOrEmpty()) return "N/A"
    return try {
        val raw = dateStr.trim()
        val cleanDateStr = if (raw.contains("T")) raw.substringBefore("T") else raw.substringBefore(" ")
        val parts = cleanDateStr.split("-")
        if (parts.size == 3) {
            "${parts[2]}-${parts[1]}-${parts[0]}"
        } else {
            raw
        }
    } catch (e: Exception) {
        dateStr
    }
}

fun calculateExpiryDate(mfgDateStr: String?, gapYears: Int): String {
    if (mfgDateStr.isNullOrBlank() || gapYears <= 0) return ""
    return try {
        val raw = mfgDateStr.trim()
        val clean = if (raw.contains("T")) raw.substringBefore("T") else raw.substringBefore(" ")
        val parts = clean.split("-")
        if (parts.size >= 3) {
            val y = parts[0].toIntOrNull() ?: return ""
            val m = parts[1].toIntOrNull() ?: return ""
            val d = parts[2].toIntOrNull() ?: return ""
            val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
            cal.set(Calendar.YEAR, y)
            cal.set(Calendar.MONTH, m - 1)
            cal.set(Calendar.DAY_OF_MONTH, d)
            cal.add(Calendar.YEAR, gapYears)
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            sdf.format(cal.time)
        } else if (parts.size == 2) {
            val y = parts[0].toIntOrNull() ?: return ""
            val m = parts[1].toIntOrNull() ?: return ""
            val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
            cal.set(Calendar.YEAR, y)
            cal.set(Calendar.MONTH, m - 1)
            cal.add(Calendar.YEAR, gapYears)
            val sdf = SimpleDateFormat("yyyy-MM", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            sdf.format(cal.time)
        } else {
            ""
        }
    } catch (e: Exception) {
        ""
    }
}

fun getYearGap(mfgDateStr: String?, expDateStr: String?): Int? {
    if (mfgDateStr.isNullOrBlank() || expDateStr.isNullOrBlank()) return null
    return try {
        val cleanMfg = if (mfgDateStr.contains("T")) mfgDateStr.substringBefore("T") else mfgDateStr.substringBefore(" ")
        val cleanExp = if (expDateStr.contains("T")) expDateStr.substringBefore("T") else expDateStr.substringBefore(" ")
        val mfgParts = cleanMfg.split("-")
        val expParts = cleanExp.split("-")
        if (mfgParts.size >= 2 && expParts.size >= 2) {
            val mfgY = mfgParts[0].toIntOrNull() ?: return null
            val mfgM = mfgParts[1].toIntOrNull() ?: return null
            val expY = expParts[0].toIntOrNull() ?: return null
            val expM = expParts[1].toIntOrNull() ?: return null
            val gap = Math.round((expY - mfgY).toDouble() + (expM - mfgM).toDouble() / 12.0).toInt()
            if (gap in 1..15) gap else null
        } else null
    } catch (e: Exception) {
        null
    }
}

fun getProductExpiryGap(product: Product?): Int? {
    if (product == null || product.variants.isEmpty()) return null
    val gapCounts = mutableMapOf<Int, Int>()
    for (v in product.variants) {
        for (b in v.batches) {
            val mfg = b.mfgDate
            val exp = b.expDate
            if (!mfg.isNullOrBlank() && !exp.isNullOrBlank()) {
                val gap = getYearGap(mfg, exp)
                if (gap != null && gap in 1..15) {
                    gapCounts[gap] = (gapCounts[gap] ?: 0) + 1
                }
            }
        }
    }
    if (gapCounts.isEmpty()) return null
    return gapCounts.maxByOrNull { it.value }?.key
}

fun getExpiryGapFromDraftVariants(draftVariants: List<DraftVariant>): Int? {
    val gapCounts = mutableMapOf<Int, Int>()
    for (v in draftVariants) {
        for (b in v.batches) {
            val mfg = b.mfgDate
            val exp = b.expDate
            if (mfg.isNotBlank() && exp.isNotBlank()) {
                val gap = getYearGap(mfg, exp)
                if (gap != null && gap in 1..15) {
                    gapCounts[gap] = (gapCounts[gap] ?: 0) + 1
                }
            }
        }
    }
    if (gapCounts.isEmpty()) return null
    return gapCounts.maxByOrNull { it.value }?.key
}

fun getProductPackUnit(product: Product?): String {
    if (product == null || product.variants.isEmpty()) return ""
    val counts = mutableMapOf<String, Int>()
    val unitRegex = Regex("^[\\d.]+(.+)$")
    for (v in product.variants) {
        var unit = (v.packSizeType ?: "").uppercase().trim()
        if (unit.isEmpty() && v.packSize.isNotEmpty() && v.packSize != "Standard") {
            val match = unitRegex.find(v.packSize)
            if (match != null && match.groupValues.size > 1) {
                unit = match.groupValues[1].uppercase().trim()
            }
        }
        if (unit.isNotEmpty()) {
            counts[unit] = (counts[unit] ?: 0) + 1
        }
    }
    if (counts.isEmpty()) return ""
    return counts.maxByOrNull { it.value }?.key ?: ""
}

fun getDraftVariantsPackUnit(draftVariants: List<DraftVariant>): String {
    val counts = mutableMapOf<String, Int>()
    val unitRegex = Regex("^[\\d.]+(.+)$")
    for (v in draftVariants) {
        var unit = v.packSizeType.uppercase().trim()
        if (unit.isEmpty() && v.packSizeValue.isNotEmpty()) {
            val match = unitRegex.find(v.packSizeValue)
            if (match != null && match.groupValues.size > 1) {
                unit = match.groupValues[1].uppercase().trim()
            }
        }
        if (unit.isNotEmpty()) {
            counts[unit] = (counts[unit] ?: 0) + 1
        }
    }
    return counts.maxByOrNull { it.value }?.key ?: ""
}

@Composable
fun ExpiryYearsPicker(
    selectedGap: Int?,
    onGapSelected: (Int) -> Unit,
    onClear: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        Surface(
            onClick = { expanded = true },
            shape = RoundedCornerShape(8.dp),
            color = if (selectedGap != null) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh,
            border = BorderStroke(
                width = 1.dp,
                color = if (selectedGap != null) MaterialTheme.colorScheme.primary.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant
            ),
            modifier = Modifier.height(34.dp)
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = if (selectedGap != null) "+$selectedGap yr${if (selectedGap > 1) "s" else ""}" else "+yrs",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (selectedGap != null) FontWeight.Bold else FontWeight.Medium,
                    color = if (selectedGap != null) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant
                )
                Icon(
                    imageVector = Icons.Default.ArrowDropDown,
                    contentDescription = "Select expiry gap in years",
                    tint = if (selectedGap != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            DropdownMenuItem(
                text = { Text("None (Clear gap)", style = MaterialTheme.typography.bodySmall) },
                onClick = {
                    onClear()
                    expanded = false
                }
            )
            HorizontalDivider()
            for (yr in 1..15) {
                val isSelected = selectedGap == yr
                DropdownMenuItem(
                    text = {
                        Text(
                            text = "+$yr year${if (yr > 1) "s" else ""}",
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
                        )
                    },
                    leadingIcon = if (isSelected) {
                        { Icon(Icons.Default.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp)) }
                    } else null,
                    onClick = {
                        onGapSelected(yr)
                        expanded = false
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductsScreen(
    viewModel: MainViewModel,
    onSubPageToggle: (Boolean) -> Unit = {}
) {
    val context = LocalContext.current
    val products by viewModel.products.collectAsState()
    val categories by viewModel.categories.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val marqueeEnabled by viewModel.marqueeEnabled.collectAsState()
    val isDataCached by viewModel.isDataCached.collectAsState()
    val isSyncingLive by viewModel.isSyncingLive.collectAsState()
    val lastSyncTimestamp by viewModel.lastSyncTimestamp.collectAsState()
    val changedMetricKeys by viewModel.changedMetricKeys.collectAsState()

    var isRefreshing by remember { mutableStateOf(false) }

    var selectedSubPage by remember { mutableStateOf(ProductSubPage.ALL) }

    // Industrial Standard Sub-page Back Navigation
    BackHandler(enabled = selectedSubPage != ProductSubPage.ALL) {
        selectedSubPage = ProductSubPage.ALL
    }
    var selectedCategoryFilter by remember { mutableStateOf("All") }
    var selectedProductForDetails by remember { mutableStateOf<Product?>(null) }
    var editingProduct by remember { mutableStateOf<Product?>(null) }
    var showCreateProduct by remember { mutableStateOf(false) }
    var showAddCategory by remember { mutableStateOf(false) }

    LaunchedEffect(selectedProductForDetails, editingProduct, showCreateProduct) {
        onSubPageToggle(selectedProductForDetails != null || editingProduct != null || showCreateProduct)
    }

    // Search and Sort states
    var searchQuery by remember { mutableStateOf("") }
    var selectedAlphabetLetter by remember { mutableStateOf<String?>(null) }
    var currentSortOption by remember { mutableStateOf(ProductSortOption.ALPHA_AZ) }
    var filterMultiVariants by remember { mutableStateOf(false) }
    var filterMultiBatches by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }

    // Scroll state for collapsing ONLY the top page selector under notification bar
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

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            isRefreshing = true
            viewModel.loadProducts()
            isRefreshing = false
        }
    ) {
        // Standard Scaffold without WindowInsets override so FAB vertical positioning matches Billing & Contacts
        Scaffold(
            floatingActionButton = {
                if (!showCreateProduct && editingProduct == null) {
                    when (selectedSubPage) {
                        ProductSubPage.ALL -> {
                            AutoCollapsingSquareFab(
                                label = "New Product",
                                icon = Icons.Default.Add,
                                onClick = { showCreateProduct = true }
                            )
                        }
                        ProductSubPage.CATEGORIES -> {
                            AutoCollapsingSquareFab(
                                label = "New Category",
                                icon = Icons.Default.Add,
                                onClick = { showAddCategory = true }
                            )
                        }
                    }
                }
            }
        ) { _ ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .nestedScroll(nestedScrollConnection)
                    .background(MaterialTheme.colorScheme.background)
            ) {
                // Unified Floating Header Box - Positioned immediately under notification bar
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
                        // Page Selector Pill directly under notification bar, collapses under status bar on scroll
                        AnimatedVisibility(
                            visible = isPageSelectorVisible,
                            enter = expandVertically() + fadeIn(),
                            exit = shrinkVertically() + fadeOut()
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(MaterialTheme.colorScheme.surface, CircleShape)
                                    .padding(4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                ProductSubPage.values().forEach { subPage ->
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
                        }

                        // Search & Filters only shown on Products tab (smoothly animated expansion)
                        AnimatedVisibility(
                            visible = selectedSubPage == ProductSubPage.ALL,
                            enter = expandVertically(animationSpec = tween(300, easing = FastOutSlowInEasing)) + fadeIn(animationSpec = tween(300)),
                            exit = shrinkVertically(animationSpec = tween(300, easing = FastOutSlowInEasing)) + fadeOut(animationSpec = tween(300))
                        ) {
                            Column {
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    PixelSearchBar(
                                        query = searchQuery,
                                        onQueryChange = { searchQuery = it },
                                        placeholder = "Search products...",
                                        modifier = Modifier.weight(1f)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Box {
                                        IconButton(
                                            onClick = { showSortMenu = true },
                                            modifier = Modifier
                                                .size(48.dp)
                                                .background(
                                                    if (filterMultiVariants || filterMultiBatches) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                                    RoundedCornerShape(12.dp)
                                                )
                                        ) {
                                            Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Sort & Filter Options")
                                        }

                                        DropdownMenu(
                                            expanded = showSortMenu,
                                            onDismissRequest = { showSortMenu = false }
                                        ) {
                                            Text("Sort By", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.primary)
                                            ProductSortOption.values().forEach { option ->
                                                DropdownMenuItem(
                                                    text = { Text(option.title, fontWeight = if (currentSortOption == option) FontWeight.Bold else FontWeight.Normal) },
                                                    onClick = {
                                                        currentSortOption = option
                                                        showSortMenu = false
                                                    },
                                                    leadingIcon = if (currentSortOption == option) {
                                                        { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                                                    } else null
                                                )
                                            }

                                            HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                            Text("Filter Options", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.primary)
                                            DropdownMenuItem(
                                                text = {
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Checkbox(checked = filterMultiVariants, onCheckedChange = null)
                                                        Spacer(modifier = Modifier.width(8.dp))
                                                        Text("Multiple Variants Only")
                                                    }
                                                },
                                                onClick = { filterMultiVariants = !filterMultiVariants }
                                            )
                                            DropdownMenuItem(
                                                text = {
                                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                                        Checkbox(checked = filterMultiBatches, onCheckedChange = null)
                                                        Spacer(modifier = Modifier.width(8.dp))
                                                        Text("Multiple Batches Only")
                                                    }
                                                },
                                                onClick = { filterMultiBatches = !filterMultiBatches }
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                // Category Filter Chips
                                LazyRow(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    item {
                                        FilterChip(
                                            selected = selectedCategoryFilter == "All",
                                            onClick = { selectedCategoryFilter = "All" },
                                            label = { Text("All") }
                                        )
                                    }
                                    items(categories) { cat ->
                                        FilterChip(
                                            selected = selectedCategoryFilter.equals(cat.name, ignoreCase = true),
                                            onClick = { selectedCategoryFilter = cat.name },
                                            label = { Text(cat.name) }
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(4.dp))
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

                // Main Content Area with smooth transition
                AnimatedContent(
                    targetState = selectedSubPage,
                    transitionSpec = {
                        val targetIndex = targetState.ordinal
                        val initialIndex = initialState.ordinal
                        slideInHorizontally(initialOffsetX = { if (targetIndex > initialIndex) it else -it }) + fadeIn() togetherWith
                                slideOutHorizontally(targetOffsetX = { if (targetIndex > initialIndex) -it else it }) + fadeOut()
                    },
                    modifier = Modifier.fillMaxSize()
                ) { targetPage ->
                    when (targetPage) {
                        ProductSubPage.ALL -> {
                            ProductsCatalogView(
                                products = products,
                                categories = categories,
                                searchQuery = searchQuery,
                                selectedCategory = selectedCategoryFilter,
                                currentSortOption = currentSortOption,
                                filterMultiVariants = filterMultiVariants,
                                filterMultiBatches = filterMultiBatches,
                                selectedAlphabetLetter = selectedAlphabetLetter,
                                onLetterSelected = { selectedAlphabetLetter = it },
                                onProductClick = { selectedProductForDetails = it },
                                marqueeEnabled = marqueeEnabled,
                                isCountChanged = changedMetricKeys.contains("products_count")
                            )
                        }
                        ProductSubPage.CATEGORIES -> {
                            CategoriesDashboardView(
                                categories = categories,
                                products = products,
                                viewModel = viewModel,
                                onViewCategoryProducts = { categoryName ->
                                    selectedCategoryFilter = categoryName
                                    selectedSubPage = ProductSubPage.ALL
                                },
                                marqueeEnabled = marqueeEnabled
                            )
                        }
                    }
                }
            }
        }
    }

    // Create Product Full-Screen Overlay
    AnimatedVisibility(
        visible = showCreateProduct,
        enter = fadeIn(),
        exit = fadeOut()
    ) {
        CreateProductFullScreenDialog(
            categories = categories,
            onDismiss = { showCreateProduct = false },
            onSave = { newProd ->
                viewModel.createProduct(newProd) { success, err ->
                    if (success) {
                        Toast.makeText(context, "Product created successfully!", Toast.LENGTH_SHORT).show()
                        showCreateProduct = false
                    } else {
                        Toast.makeText(context, "Failed: $err", Toast.LENGTH_LONG).show()
                    }
                }
            }
        )
    }

    if (showAddCategory) {
        var catName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAddCategory = false },
            title = { Text("Add Category") },
            text = { OutlinedTextField(value = catName, onValueChange = { catName = it }, label = { Text("Category Name") }) },
            confirmButton = { Button(onClick = { viewModel.createCategory(catName) { s, _ -> if (s) viewModel.loadProducts(); showAddCategory = false } }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { showAddCategory = false }) { Text("Cancel") } }
        )
    }

    var productToDeleteConfirm by remember { mutableStateOf<Product?>(null) }

    // Modal Bottom Sheet for Product Details
    if (selectedProductForDetails != null) {
        ProductDetailsBottomSheet(
            product = selectedProductForDetails!!,
            onDismiss = { selectedProductForDetails = null },
            onEditProduct = {
                editingProduct = selectedProductForDetails
                selectedProductForDetails = null
            },
            onDeleteProduct = {
                productToDeleteConfirm = selectedProductForDetails
            },
            viewModel = viewModel
        )
    }

    // Confirmation Alert Dialog before Product Deletion
    if (productToDeleteConfirm != null) {
        AlertDialog(
            onDismissRequest = { productToDeleteConfirm = null },
            icon = { Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("Delete Product", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to delete '${productToDeleteConfirm!!.name}'? All variants and batches for this product will be permanently deleted.") },
            confirmButton = {
                Button(
                    onClick = {
                        val prod = productToDeleteConfirm!!
                        viewModel.deleteProduct(prod.idString) { success, err ->
                            if (success) {
                                Toast.makeText(context, "Product deleted", Toast.LENGTH_SHORT).show()
                                if (selectedProductForDetails?.idString == prod.idString) {
                                    selectedProductForDetails = null
                                }
                                viewModel.loadProducts()
                            } else {
                                Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                            }
                            productToDeleteConfirm = null
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                OutlinedButton(onClick = { productToDeleteConfirm = null }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Edit Product Full-Screen Overlay
    AnimatedVisibility(
        visible = editingProduct != null,
        enter = fadeIn(),
        exit = fadeOut()
    ) {
        editingProduct?.let { product ->
            EditProductFullScreenDialog(
                product = product,
                categories = categories,
                onDismiss = { editingProduct = null },
                onSave = { updatedProd ->
                    viewModel.updateProduct(product.idString, updatedProd) { success, err ->
                        if (success) {
                            Toast.makeText(context, "Product updated successfully!", Toast.LENGTH_SHORT).show()
                            editingProduct = null
                            viewModel.loadProducts()
                        } else {
                            Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                        }
                    }
                }
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ProductsCatalogView(
    products: List<Product>,
    categories: List<Category>,
    searchQuery: String,
    selectedCategory: String,
    currentSortOption: ProductSortOption,
    filterMultiVariants: Boolean,
    filterMultiBatches: Boolean,
    selectedAlphabetLetter: String? = null,
    onLetterSelected: (String?) -> Unit = {},
    onProductClick: (Product) -> Unit,
    marqueeEnabled: Boolean = true,
    isCountChanged: Boolean = false
) {
    val filteredProducts = products.filter { prod ->
        val matchesSearch = prod.name.contains(searchQuery, ignoreCase = true)

        val matchesCategory = selectedCategory == "All" ||
                prod.category.equals(selectedCategory, ignoreCase = true) ||
                (prod.categoryName?.equals(selectedCategory, ignoreCase = true) == true) ||
                prod.categoryId == categories.find { c -> c.name.equals(selectedCategory, ignoreCase = true) }?.idString

        val matchesMultiVar = if (filterMultiVariants) prod.variants.size > 1 else true
        val matchesMultiBatch = if (filterMultiBatches) prod.variants.any { v -> v.batches.size > 1 } else true
        val matchesAlphabet = selectedAlphabetLetter == null || prod.name.startsWith(selectedAlphabetLetter, ignoreCase = true)

        matchesSearch && matchesCategory && matchesMultiVar && matchesMultiBatch && matchesAlphabet
    }.sortedWith { a, b ->
        when (currentSortOption) {
            ProductSortOption.ALPHA_AZ -> a.name.compareTo(b.name, ignoreCase = true)
            ProductSortOption.ALPHA_ZA -> b.name.compareTo(a.name, ignoreCase = true)
            ProductSortOption.TOP_SELLING -> b.getTotalUnitsSold().compareTo(a.getTotalUnitsSold())
            ProductSortOption.RECENTLY_ADDED -> (b.createdAt ?: "").compareTo(a.createdAt ?: "")
            ProductSortOption.RECENTLY_SOLD -> (b.updatedAt ?: "").compareTo(a.updatedAt ?: "")
        }
    }

    // Alphabetical Grouping
    val groupedProducts = if (currentSortOption == ProductSortOption.ALPHA_AZ || currentSortOption == ProductSortOption.ALPHA_ZA) {
        filteredProducts.groupBy { it.name.take(1).uppercase() }
    } else {
        mapOf("All" to filteredProducts)
    }

    val expandedGroups = remember { mutableStateMapOf<String, Boolean>() }
    LaunchedEffect(groupedProducts.keys) {
        groupedProducts.keys.forEach { if (!expandedGroups.containsKey(it)) expandedGroups[it] = true }
    }

    val gridState = rememberLazyGridState()
    val availableLetters = remember(filteredProducts) {
        val alphaList = filteredProducts
            .map { it.name.trim().take(1).uppercase() }
            .filter { it.isNotEmpty() && it.first().isLetter() }
            .distinct()
            .sorted()
        listOf("All") + alphaList
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (filteredProducts.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "No products match criteria.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyVerticalGrid(
                state = gridState,
                columns = GridCells.Adaptive(minSize = 160.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 150.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                groupedProducts.forEach { (header, items) ->
                    if (header != "All") {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            val isExpanded = expandedGroups[header] ?: true
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { expandedGroups[header] = !isExpanded }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = header,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Black,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.weight(1f)
                                )
                                Icon(
                                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    if (header == "All" || expandedGroups[header] == true) {
                        items(items) { product ->
                            ProductCardModern(
                                product = product,
                                onClick = { onProductClick(product) },
                                marqueeEnabled = marqueeEnabled,
                                isHighlighted = isCountChanged
                            )
                        }
                    }
                }
            }
        }

        // Material 3 Dynamic Vertical Alphabet Fast Slider on Right Edge (Available Alphabets Only)
        if (availableLetters.size > 1) {
            VerticalAlphabetSlider(
                letters = availableLetters,
                gridState = gridState,
                groupedProducts = groupedProducts,
                onLetterSelected = onLetterSelected,
                modifier = Modifier.align(Alignment.CenterEnd)
            )
        }
    }
}

@Composable
fun VerticalAlphabetSlider(
    letters: List<String>,
    gridState: LazyGridState,
    groupedProducts: Map<String, List<Product>>,
    onLetterSelected: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    var isTouching by remember { mutableStateOf(false) }
    var activeTouchLetter by remember { mutableStateOf<String?>(null) }

    val headerIndices = remember(groupedProducts) {
        val map = mutableMapOf<String, Int>()
        var currentIndex = 0
        groupedProducts.forEach { (header, items) ->
            if (header != "All") {
                map[header] = currentIndex
                currentIndex += 1
            }
            currentIndex += items.size
        }
        map
    }

    val currentScrollLetter = remember(gridState.firstVisibleItemIndex, headerIndices) {
        headerIndices.entries.lastOrNull { it.value <= gridState.firstVisibleItemIndex }?.key
    }

    val displayLetter = if (isTouching) activeTouchLetter else currentScrollLetter

    // Calculate scroll progress for the thin bar
    val totalItems = remember(headerIndices) { headerIndices.values.maxOrNull()?.coerceAtLeast(1) ?: 1 }
    val currentScrollProgress = (gridState.firstVisibleItemIndex.toFloat() / totalItems).coerceIn(0f, 1f)

    Box(
        modifier = modifier
            .padding(end = 8.dp, top = 32.dp, bottom = 180.dp)
            .fillMaxHeight(),
        contentAlignment = Alignment.CenterEnd
    ) {
        // Floating Indicator Bubble (Industrial Standard Fast Scroller)
        AnimatedVisibility(
            visible = isTouching && displayLetter != null,
            enter = fadeIn() + scaleIn(),
            exit = fadeOut() + scaleOut(),
            modifier = Modifier.padding(end = 56.dp)
        ) {
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                tonalElevation = 8.dp,
                shadowElevation = 8.dp
            ) {
                Box(
                    modifier = Modifier.size(64.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = displayLetter ?: "",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black
                    )
                }
            }
        }

        // Industrial Touch Target Track (Using systemGestureExclusion)
        Box(
            modifier = Modifier
                .width(48.dp) // Wide touch target to intercept before back gesture
                .fillMaxHeight()
                .systemGestureExclusion()
                .pointerInput(letters, headerIndices) {
                    detectVerticalDragGestures(
                        onDragStart = { offset ->
                            isTouching = true
                            val letterIndex = (offset.y / size.height * letters.size).toInt().coerceIn(0, letters.size - 1)
                            val selected = letters[letterIndex]
                            activeTouchLetter = selected
                            val targetIdx = headerIndices[selected]
                            if (targetIdx != null) {
                                coroutineScope.launch { gridState.scrollToItem(targetIdx) }
                            } else if (selected == "All") {
                                onLetterSelected(null)
                                coroutineScope.launch { gridState.scrollToItem(0) }
                            }
                        },
                        onDragEnd = { isTouching = false; activeTouchLetter = null },
                        onDragCancel = { isTouching = false; activeTouchLetter = null },
                        onVerticalDrag = { change, _ ->
                            change.consume()
                            val letterIndex = (change.position.y / size.height * letters.size).toInt().coerceIn(0, letters.size - 1)
                            val selected = letters[letterIndex]
                            if (selected != activeTouchLetter) {
                                activeTouchLetter = selected
                                val targetIdx = headerIndices[selected]
                                if (targetIdx != null) {
                                    coroutineScope.launch { gridState.scrollToItem(targetIdx) }
                                } else if (selected == "All") {
                                    onLetterSelected(null)
                                    coroutineScope.launch { gridState.scrollToItem(0) }
                                }
                            }
                        }
                    )
                },
            contentAlignment = Alignment.CenterEnd
        ) {
            // Visual Track (Thin pill)
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                shape = CircleShape,
                modifier = Modifier
                    .width(if (isTouching) 8.dp else 4.dp)
                    .fillMaxHeight()
            ) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                    // Progress Fill
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .fillMaxHeight(currentScrollProgress)
                            .background(MaterialTheme.colorScheme.primary, CircleShape)
                    )
                }
            }
        }
    }
}

@Composable
fun ProductCardModern(
    product: Product,
    onClick: () -> Unit,
    marqueeEnabled: Boolean = true,
    isHighlighted: Boolean = false
) {
    val variantCount = product.variants.size
    val batchCount = product.variants.sumOf { it.batches.size }
    val countBadgeText = "${variantCount}V:${batchCount}B"

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .m3ValueChangeHighlight(isHighlighted, shape = RoundedCornerShape(16.dp)),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        shape = CircleShape,
                        color = if (product.classification.equals("Gold", ignoreCase = true))
                            Color(0xFFFFD700).copy(alpha = 0.2f) else MaterialTheme.colorScheme.primaryContainer
                    ) {
                        Text(
                            text = product.category.take(1).uppercase(),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (product.classification.equals("Gold", ignoreCase = true))
                                Color(0xFFB8860B) else MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }

                    // 1V:2B Variant & Batch Count Badge
                    Surface(
                        color = MaterialTheme.colorScheme.tertiaryContainer,
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = countBadgeText,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Black,
                            color = MaterialTheme.colorScheme.onTertiaryContainer
                        )
                    }
                }

                if (product.getTotalUnitsSold() > 0) {
                    Text(
                        text = "🔥 ${product.getTotalUnitsSold()}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = product.name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = if (marqueeEnabled) 1 else 2,
                overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                modifier = Modifier.appMarquee(marqueeEnabled)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = product.category,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis,
                modifier = Modifier.appMarquee(marqueeEnabled)
            )
            Spacer(modifier = Modifier.height(12.dp))

            // Variants range logic
            if (product.variants.isNotEmpty()) {
                val varCount = product.variants.size
                val firstVar = product.variants.first().packSize
                val lastVar = product.variants.last().packSize
                val rangeText = if (varCount > 1) "$firstVar - $lastVar" else firstVar

                Surface(
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = rangeText,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            // Price Range Logic
            val allMrps = product.variants.flatMap { it.batches }.map { it.mrp }
            val minMrp = allMrps.minOrNull() ?: product.mrp ?: 0.0
            val maxMrp = allMrps.maxOrNull() ?: product.mrp ?: 0.0

            Spacer(modifier = Modifier.height(8.dp))
            val priceStr = if (minMrp == maxMrp) formatCurrency(minMrp) else "${formatCurrency(minMrp)} - ${formatCurrency(maxMrp)}"
            Text(
                text = priceStr,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.ExtraBold
            )
        }
    }
}

// -----------------------------------------------------------------------------------------
// COMPREHENSIVE DETAILS BOTTOM SHEET (With Variant & Batch Editing and Confirmed Deletion)
// -----------------------------------------------------------------------------------------
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductDetailsBottomSheet(
    product: Product,
    onDismiss: () -> Unit,
    onEditProduct: () -> Unit,
    onDeleteProduct: () -> Unit,
    viewModel: MainViewModel
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val context = LocalContext.current

    var editingVariant by remember { mutableStateOf<ProductVariant?>(null) }
    var editingBatch by remember { mutableStateOf<ProductBatch?>(null) }
    var variantToDelete by remember { mutableStateOf<ProductVariant?>(null) }
    var batchToDelete by remember { mutableStateOf<ProductBatch?>(null) }

    var showAddVariantModal by remember { mutableStateOf(false) }
    var targetVariantForBatchModal by remember { mutableStateOf<ProductVariant?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        modifier = Modifier
            .fillMaxHeight()
            .statusBarsPadding()
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
            contentPadding = PaddingValues(bottom = 100.dp)
        ) {
            item {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = product.name,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    // Symmetric Grid Layout for Meta Info
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Left Column
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Surface(
                                color = MaterialTheme.colorScheme.secondaryContainer,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp).horizontalScroll(rememberScrollState()),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(Icons.Outlined.Category, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = product.category,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                                        maxLines = 1
                                    )
                                }
                            }

                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("Created", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(formatDateReadable(product.createdAt), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, modifier = Modifier.horizontalScroll(rememberScrollState()))
                                }
                            }
                        }

                        // Right Column
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Surface(
                                color = if (product.classification.equals("Gold", ignoreCase = true)) Color(0xFFFFD700).copy(alpha = 0.25f) else MaterialTheme.colorScheme.tertiaryContainer,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp).horizontalScroll(rememberScrollState()),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(Icons.Outlined.WorkspacePremium, contentDescription = null, tint = if (product.classification.equals("Gold", ignoreCase = true)) Color(0xFFB8860B) else MaterialTheme.colorScheme.onTertiaryContainer, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = product.classification,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (product.classification.equals("Gold", ignoreCase = true)) Color(0xFFB8860B) else MaterialTheme.colorScheme.onTertiaryContainer,
                                        maxLines = 1
                                    )
                                }
                            }

                            Surface(
                                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text("Edited", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(formatDateReadable(product.updatedAt), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, modifier = Modifier.horizontalScroll(rememberScrollState()))
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Symmetric Action Buttons Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        FilledTonalButton(
                            onClick = { showAddVariantModal = true },
                            modifier = Modifier.weight(1f).height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 2.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("Variant", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                        }
                        FilledTonalButton(
                            onClick = onEditProduct,
                            modifier = Modifier.weight(1f).height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            contentPadding = PaddingValues(horizontal = 2.dp)
                        ) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit Product", modifier = Modifier.size(18.dp))
                            Text("Edit", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                        }
                        FilledTonalButton(
                            onClick = onDeleteProduct,
                            modifier = Modifier.weight(1f).height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.filledTonalButtonColors(
                                containerColor = MaterialTheme.colorScheme.errorContainer,
                                contentColor = MaterialTheme.colorScheme.onErrorContainer
                            ),
                            contentPadding = PaddingValues(horizontal = 2.dp)
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete Product", modifier = Modifier.size(18.dp))
                            Text("Delete", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider()
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Variants & Batches",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            if (product.variants.isEmpty()) {
                item { Text("No variants available.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            } else {
                items(product.variants) { variant ->
                    ElevatedCard(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            // Variant Title across 100% width - Full Visibility!
                            Surface(
                                color = MaterialTheme.colorScheme.primaryContainer,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .padding(horizontal = 14.dp, vertical = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Outlined.Inventory2, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer, modifier = Modifier.size(22.dp))
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Text(
                                        text = "Variant / Pack Size: ${variant.packSize}",
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Black,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        maxLines = 2
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            // Symmetrical Action buttons row below Variant Title (3 Equal Buttons)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                FilledTonalButton(
                                    onClick = { targetVariantForBatchModal = variant },
                                    modifier = Modifier.weight(1f).height(40.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 2.dp)
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Text("Batch", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                                }
                                FilledTonalButton(
                                    onClick = { editingVariant = variant },
                                    modifier = Modifier.weight(1f).height(40.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 2.dp)
                                ) {
                                    Icon(Icons.Default.Edit, contentDescription = "Edit Variant", modifier = Modifier.size(16.dp))
                                    Text("Edit", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                                }
                                FilledTonalButton(
                                    onClick = { variantToDelete = variant },
                                    modifier = Modifier.weight(1f).height(40.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = ButtonDefaults.filledTonalButtonColors(
                                        containerColor = MaterialTheme.colorScheme.errorContainer,
                                        contentColor = MaterialTheme.colorScheme.onErrorContainer
                                    ),
                                    contentPadding = PaddingValues(horizontal = 2.dp)
                                ) {
                                    Icon(Icons.Default.Delete, contentDescription = "Delete Variant", modifier = Modifier.size(16.dp))
                                    Text("Delete", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            if (variant.batches.isEmpty()) {
                                Text("No batches under this variant.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            } else {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    variant.sortedBatches.forEach { batch ->
                                        Card(
                                            modifier = Modifier.fillMaxWidth(),
                                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest),
                                            shape = RoundedCornerShape(12.dp)
                                        ) {
                                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                                // Batch Header & Stats (Scrollable to prevent truncation)
                                                Row(
                                                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    Surface(
                                                        color = MaterialTheme.colorScheme.surface,
                                                        shape = RoundedCornerShape(6.dp)
                                                    ) {
                                                        Text(
                                                            text = "Batch ${batch.effectiveBatchNo}",
                                                            style = MaterialTheme.typography.titleMedium,
                                                            fontWeight = FontWeight.ExtraBold,
                                                            color = MaterialTheme.colorScheme.primary,
                                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                            maxLines = 1
                                                        )
                                                    }
                                                    Text(
                                                        text = formatCurrency(batch.mrp),
                                                        style = MaterialTheme.typography.titleMedium,
                                                        fontWeight = FontWeight.Black,
                                                        color = MaterialTheme.colorScheme.onSurface,
                                                        maxLines = 1
                                                    )
                                                    Surface(
                                                        color = MaterialTheme.colorScheme.secondaryContainer,
                                                        shape = RoundedCornerShape(6.dp)
                                                    ) {
                                                        Text(
                                                            text = "Sold: ${batch.unitsSold}",
                                                            style = MaterialTheme.typography.labelMedium,
                                                            fontWeight = FontWeight.Bold,
                                                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                            maxLines = 1
                                                        )
                                                    }
                                                }

                                                // Dates Row (Scrollable)
                                                Row(
                                                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                                ) {
                                                    Text("Mfg: ${formatDateReadable(batch.mfgDate)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                                    Text("Exp: ${formatDateReadable(batch.expDate)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                                }

                                                // Symmetrical Batch Action Buttons (2 Equal Buttons)
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                    verticalAlignment = Alignment.CenterVertically
                                                ) {
                                                    FilledTonalButton(
                                                        onClick = { editingBatch = batch },
                                                        modifier = Modifier.weight(1f).height(36.dp),
                                                        shape = RoundedCornerShape(8.dp),
                                                        contentPadding = PaddingValues(horizontal = 2.dp)
                                                    ) {
                                                        Icon(Icons.Default.Edit, contentDescription = "Edit Batch", modifier = Modifier.size(16.dp))
                                                        Text("Edit", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                                                    }
                                                    FilledTonalButton(
                                                        onClick = { batchToDelete = batch },
                                                        modifier = Modifier.weight(1f).height(36.dp),
                                                        shape = RoundedCornerShape(8.dp),
                                                        colors = ButtonDefaults.filledTonalButtonColors(
                                                            containerColor = MaterialTheme.colorScheme.errorContainer,
                                                            contentColor = MaterialTheme.colorScheme.onErrorContainer
                                                        ),
                                                        contentPadding = PaddingValues(horizontal = 2.dp)
                                                    ) {
                                                        Icon(Icons.Default.Delete, contentDescription = "Delete Batch", modifier = Modifier.size(16.dp))
                                                        Text("Delete", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.padding(start = 4.dp))
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddVariantModal) {
        val detectedUnit = getProductPackUnit(product).ifBlank { "ML" }
        val detectedGap = getProductExpiryGap(product)
        AddVariantModal(
            defaultUnit = detectedUnit,
            defaultExpiryGap = detectedGap,
            onDismiss = { showAddVariantModal = false },
            onAdd = { dVar ->
                showAddVariantModal = false
                val newVar = ProductVariant(
                    id = "",
                    packSizeValue = dVar.packSizeValue.toDoubleOrNull() ?: dVar.packSizeValue,
                    packSizeType = dVar.packSizeType,
                    batches = dVar.batches.map { dB ->
                        ProductBatch(
                            id = "",
                            batchNo = dB.batchNo.ifEmpty { "DEFAULT" },
                            mrp = dB.mrp.toDoubleOrNull() ?: 0.0,
                            mfgDate = dB.mfgDate.ifEmpty { null },
                            expDate = dB.expDate.ifEmpty { null },
                            unitsSold = dB.unitsSold.toIntOrNull() ?: 0
                        )
                    }
                )
                val updatedVariants = product.variants + newVar
                val updatedProd = product.copy(variants = updatedVariants)
                viewModel.updateProduct(product.idString, updatedProd) { success, err ->
                    if (success) {
                        Toast.makeText(context, "Variant added successfully!", Toast.LENGTH_SHORT).show()
                        viewModel.loadProducts()
                    } else {
                        Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                    }
                }
            }
        )
    }

    if (targetVariantForBatchModal != null) {
        val targetVar = targetVariantForBatchModal!!
        val detectedGap = getProductExpiryGap(product)
        AddBatchModal(
            variantPackSize = targetVar.packSize,
            defaultExpiryGap = detectedGap,
            onDismiss = { targetVariantForBatchModal = null },
            onAdd = { dB ->
                targetVariantForBatchModal = null
                val newBatch = ProductBatch(
                    id = "",
                    batchNo = dB.batchNo.ifEmpty { "DEFAULT" },
                    mrp = dB.mrp.toDoubleOrNull() ?: 0.0,
                    mfgDate = dB.mfgDate.ifEmpty { null },
                    expDate = dB.expDate.ifEmpty { null },
                    unitsSold = dB.unitsSold.toIntOrNull() ?: 0
                )
                val updatedVariants = product.variants.map { v ->
                    if (v.idString == targetVar.idString || v.packSize == targetVar.packSize) {
                        v.copy(batches = v.batches + newBatch)
                    } else {
                        v
                    }
                }
                val updatedProd = product.copy(variants = updatedVariants)
                viewModel.updateProduct(product.idString, updatedProd) { success, err ->
                    if (success) {
                        Toast.makeText(context, "Batch added successfully!", Toast.LENGTH_SHORT).show()
                        viewModel.loadProducts()
                    } else {
                        Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                    }
                }
            }
        )
    }

    // Confirm Variant Delete Dialog
    if (variantToDelete != null) {
        val targetVar = variantToDelete!!
        AlertDialog(
            onDismissRequest = { variantToDelete = null },
            title = { Text("Delete Variant") },
            text = { Text("Are you sure you want to delete variant '${targetVar.packSize}' and all its associated batches? This action cannot be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        variantToDelete = null
                        val remainingVariants = product.variants.filter { it.idString != targetVar.idString }
                        val updatedProduct = product.copy(variants = remainingVariants)
                        viewModel.updateProduct(product.idString, updatedProduct) { success, err ->
                            if (success) {
                                Toast.makeText(context, "Variant deleted", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { variantToDelete = null }) { Text("Cancel") }
            }
        )
    }

    // Confirm Batch Delete Dialog
    if (batchToDelete != null) {
        val targetB = batchToDelete!!
        AlertDialog(
            onDismissRequest = { batchToDelete = null },
            title = { Text("Delete Batch") },
            text = { Text("Are you sure you want to delete batch '${targetB.effectiveBatchNo}'? This action cannot be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        batchToDelete = null
                        val updatedVariants = product.variants.map { v ->
                            v.copy(batches = v.batches.filter { it.idString != targetB.idString })
                        }
                        val updatedProd = product.copy(variants = updatedVariants)
                        viewModel.updateProduct(product.idString, updatedProd) { success, err ->
                            if (success) {
                                Toast.makeText(context, "Batch deleted", Toast.LENGTH_SHORT).show()
                                viewModel.loadProducts()
                            } else {
                                Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { batchToDelete = null }) { Text("Cancel") }
            }
        )
    }

    // Edit Variant Dialog
    if (editingVariant != null) {
        val targetV = editingVariant!!
        EditVariantDialog(
            variant = targetV,
            onDismiss = { editingVariant = null },
            onSave = { valNum, unitType ->
                editingVariant = null
                val updatedVariants = product.variants.map { v ->
                    if (v.idString == targetV.idString) {
                        v.copy(packSizeValue = valNum, packSizeType = unitType)
                    } else v
                }
                val updatedProd = product.copy(variants = updatedVariants)
                viewModel.updateProduct(product.idString, updatedProd) { success, err ->
                    if (success) {
                        Toast.makeText(context, "Variant updated", Toast.LENGTH_SHORT).show()
                        viewModel.loadProducts()
                    } else {
                        Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                    }
                }
            }
        )
    }

    // Edit Batch Dialog
    if (editingBatch != null) {
        val targetB = editingBatch!!
        EditBatchDialog(
            batch = targetB,
            onDismiss = { editingBatch = null },
            onSave = { batchNo, mrpVal, mfgDate, expDate, unitsSoldVal ->
                editingBatch = null
                val updatedVariants = product.variants.map { v ->
                    v.copy(batches = v.batches.map { b ->
                        if (b.idString == targetB.idString) {
                            b.copy(batchNo = batchNo, mrp = mrpVal, mfgDate = mfgDate.ifEmpty { null }, expDate = expDate.ifEmpty { null }, unitsSold = unitsSoldVal)
                        } else b
                    })
                }
                val updatedProd = product.copy(variants = updatedVariants)
                viewModel.updateProduct(product.idString, updatedProd) { success, err ->
                    if (success) {
                        Toast.makeText(context, "Batch updated", Toast.LENGTH_SHORT).show()
                        viewModel.loadProducts()
                    } else {
                        Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                    }
                }
            }
        )
    }
}

@Composable
fun EditVariantDialog(
    variant: ProductVariant,
    onDismiss: () -> Unit,
    onSave: (Double, String) -> Unit
) {
    val initialValue = when (val p = variant.packSizeValue) {
        is Number -> p.toDouble().toString()
        is String -> p
        else -> ""
    }
    var packSizeValue by remember { mutableStateOf(initialValue) }
    val detectedUnit = variant.packSizeType?.ifBlank { null } ?: run {
        val match = Regex("^[\\d.]+(.+)$").find(variant.packSize)
        match?.groupValues?.getOrNull(1)?.uppercase()?.trim()
    } ?: "ML"
    var packSizeType by remember { mutableStateOf(detectedUnit) }
    var expandedUnit by remember { mutableStateOf(false) }
    val basePackSizeTypes = listOf("ML", "GMS", "TAB", "L", "KG", "PCS", "BOX", "PACK", "CAPS")
    val packSizeTypes = remember(detectedUnit) {
        if (detectedUnit.isNotBlank() && !basePackSizeTypes.contains(detectedUnit)) {
            listOf(detectedUnit) + basePackSizeTypes
        } else {
            basePackSizeTypes
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Variant") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = packSizeValue,
                    onValueChange = { packSizeValue = it },
                    label = { Text("Pack Size Value") },
                    singleLine = true
                )
                @OptIn(ExperimentalMaterial3Api::class)
                ExposedDropdownMenuBox(
                    expanded = expandedUnit,
                    onExpandedChange = { expandedUnit = !expandedUnit }
                ) {
                    OutlinedTextField(
                        value = packSizeType,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Unit") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedUnit) },
                        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth()
                    )
                    ExposedDropdownMenu(expanded = expandedUnit, onDismissRequest = { expandedUnit = false }) {
                        packSizeTypes.forEach { t ->
                            DropdownMenuItem(text = { Text(t) }, onClick = { packSizeType = t; expandedUnit = false })
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val num = packSizeValue.toDoubleOrNull() ?: 0.0
                onSave(num, packSizeType)
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun EditBatchDialog(
    batch: ProductBatch,
    onDismiss: () -> Unit,
    onSave: (String, Double, String, String, Int) -> Unit
) {
    var batchNo by remember { mutableStateOf(batch.effectiveBatchNo) }
    var mrp by remember { mutableStateOf(batch.mrp.toString()) }
    var mfgDate by remember { mutableStateOf(batch.mfgDate ?: "") }
    var expDate by remember { mutableStateOf(batch.expDate ?: "") }
    var unitsSold by remember { mutableStateOf(batch.unitsSold.toString()) }
    var selectedExpiryGap by remember { mutableStateOf(getYearGap(batch.mfgDate, batch.expDate)) }

    fun updateMfg(newMfg: String) {
        mfgDate = newMfg
        selectedExpiryGap?.let { gap ->
            if (newMfg.isNotBlank()) {
                expDate = calculateExpiryDate(newMfg, gap)
            }
        }
    }

    fun updateGap(newGap: Int) {
        selectedExpiryGap = newGap
        if (mfgDate.isNotBlank()) {
            expDate = calculateExpiryDate(mfgDate, newGap)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Batch", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = batchNo, onValueChange = { batchNo = it }, label = { Text("Batch Number *") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = mrp, onValueChange = { mrp = it }, label = { Text("MRP (₹) *") }, modifier = Modifier.weight(1f))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Mfg & Expiry Dates", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    ExpiryYearsPicker(
                        selectedGap = selectedExpiryGap,
                        onGapSelected = { updateGap(it) },
                        onClear = { selectedExpiryGap = null }
                    )
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    DatePickerField(
                        value = mfgDate,
                        onDateSelected = { updateMfg(it) },
                        label = "Mfg Date",
                        modifier = Modifier.weight(1f)
                    )
                    DatePickerField(
                        value = expDate,
                        onDateSelected = { newExp ->
                            expDate = newExp
                            val gap = getYearGap(mfgDate, newExp)
                            if (gap != null) selectedExpiryGap = gap
                        },
                        label = "Exp Date",
                        modifier = Modifier.weight(1f)
                    )
                }

                OutlinedTextField(value = unitsSold, onValueChange = { unitsSold = it }, label = { Text("Units Sold") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = {
                val m = mrp.toDoubleOrNull() ?: 0.0
                val sold = unitsSold.toIntOrNull() ?: 0
                onSave(batchNo, m, mfgDate, expDate, sold)
            }) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

@Composable
fun BadgeChip(text: String, color: Color, textColor: Color) {
    Surface(color = color, shape = RoundedCornerShape(6.dp)) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = textColor
        )
    }
}

// -----------------------------------------------------------------------------------------
// COMPLEX CREATE & EDIT PRODUCT FLOWS (WEB PARITY INLINE VARIANTS & BATCHES)
// -----------------------------------------------------------------------------------------
data class DraftBatch(
    var id: String? = null,
    var batchNo: String = "BATCH-001",
    var mrp: String = "0.00",
    var mfgDate: String = "",
    var expDate: String = "",
    var unitsSold: String = "0"
)

data class DraftVariant(
    var id: String? = null,
    var packSizeValue: String = "",
    var packSizeType: String = "ML",
    val batches: MutableList<DraftBatch> = mutableListOf(DraftBatch())
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateProductFullScreenDialog(
    categories: List<Category>,
    onDismiss: () -> Unit,
    onSave: (Product) -> Unit
) {
    ProductFormFullScreenDialog(
        title = "Add Product",
        initialName = "",
        initialCategoryId = "",
        initialClassification = "Non-Gold",
        initialVariants = mutableListOf(DraftVariant()),
        categories = categories,
        onDismiss = onDismiss,
        onSave = onSave
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProductFullScreenDialog(
    product: Product,
    categories: List<Category>,
    onDismiss: () -> Unit,
    onSave: (Product) -> Unit
) {
    val initialDraftVariants = product.variants.map { v ->
        val pVal = when (val p = v.packSizeValue) {
            is Number -> p.toDouble().toString()
            is String -> p
            else -> ""
        }
        DraftVariant(
            id = v.idString.ifEmpty { null },
            packSizeValue = pVal,
            packSizeType = v.packSizeType ?: "ML",
            batches = v.sortedBatches.map { b ->
                DraftBatch(
                    id = b.idString.ifEmpty { null },
                    batchNo = b.effectiveBatchNo,
                    mrp = b.mrp.toString(),
                    mfgDate = b.mfgDate ?: "",
                    expDate = b.expDate ?: "",
                    unitsSold = b.unitsSold.toString()
                )
            }.toMutableList().ifEmpty { mutableListOf(DraftBatch()) }
        )
    }.toMutableList().ifEmpty { mutableListOf(DraftVariant()) }

    ProductFormFullScreenDialog(
        title = "Edit Product",
        initialName = product.name,
        initialCategoryId = product.categoryId ?: "",
        initialClassification = product.classification,
        initialVariants = initialDraftVariants,
        categories = categories,
        onDismiss = onDismiss,
        onSave = onSave
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductFormFullScreenDialog(
    title: String,
    initialName: String,
    initialCategoryId: String,
    initialClassification: String,
    initialVariants: MutableList<DraftVariant>,
    categories: List<Category>,
    onDismiss: () -> Unit,
    onSave: (Product) -> Unit
) {
    var name by remember { mutableStateOf(initialName) }
    var categoryId by remember { mutableStateOf(initialCategoryId) }
    var classification by remember { mutableStateOf(initialClassification) }
    val draftVariants = remember { mutableStateListOf(*initialVariants.toTypedArray()) }

    var expandedCategory by remember { mutableStateOf(false) }
    var expandedClassification by remember { mutableStateOf(false) }
    var showAddVariantModal by remember { mutableStateOf(false) }
    var targetVariantForBatchIndex by remember { mutableStateOf<Int?>(null) }

    val packSizeTypes = listOf("ML", "GMS", "TAB", "L", "KG", "PCS", "BOX", "PACK", "CAPS")
    val classifications = listOf("Gold", "Non-Gold")

    BackHandler(onBack = onDismiss)

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
            Scaffold(
                topBar = {
                    CenterAlignedTopAppBar(
                        title = { Text(title, fontWeight = FontWeight.Bold) },
                        navigationIcon = {
                            IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Cancel") }
                        }
                    )
                },
                containerColor = MaterialTheme.colorScheme.background
            ) { innerPadding ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 24.dp),
                contentPadding = PaddingValues(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                    item {
                        Text("Product Information", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product Name *") }, modifier = Modifier.fillMaxWidth())

                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = expandedCategory,
                            onExpandedChange = { expandedCategory = !expandedCategory },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val selectedCategoryName = categories.find { it.idString == categoryId }?.name ?: "Select Category"
                            OutlinedTextField(
                                value = selectedCategoryName,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Category *") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedCategory) },
                                modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth()
                            )
                            ExposedDropdownMenu(expanded = expandedCategory, onDismissRequest = { expandedCategory = false }) {
                                categories.forEach { cat ->
                                    DropdownMenuItem(text = { Text(cat.name) }, onClick = { categoryId = cat.idString; expandedCategory = false })
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))
                        ExposedDropdownMenuBox(
                            expanded = expandedClassification,
                            onExpandedChange = { expandedClassification = !expandedClassification },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            OutlinedTextField(
                                value = classification,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Classification *") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedClassification) },
                                modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth()
                            )
                            ExposedDropdownMenu(expanded = expandedClassification, onDismissRequest = { expandedClassification = false }) {
                                classifications.forEach { cls ->
                                    DropdownMenuItem(text = { Text(cls) }, onClick = { classification = cls; expandedClassification = false })
                                }
                            }
                        }
                    }

                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Variants & Batches", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        Text("Add product variants (like 500ml, 1L) and their batch information", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    items(draftVariants.size) { vIndex ->
                        val variant = draftVariants[vIndex]
                        ElevatedCard(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                    Text("Variant ${vIndex + 1}", fontWeight = FontWeight.Bold)
                                    if (draftVariants.size > 1) {
                                        TextButton(onClick = { draftVariants.removeAt(vIndex) }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
                                            Text("Remove")
                                        }
                                    }
                                }

                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = variant.packSizeValue,
                                        onValueChange = { variant.packSizeValue = it; draftVariants[vIndex] = variant.copy() },
                                        label = { Text("Pack Size *") },
                                        modifier = Modifier.weight(1f)
                                    )
                                    var expandedUnit by remember { mutableStateOf(false) }
                                    ExposedDropdownMenuBox(
                                        expanded = expandedUnit,
                                        onExpandedChange = { expandedUnit = !expandedUnit },
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        OutlinedTextField(
                                            value = variant.packSizeType,
                                            onValueChange = {},
                                            readOnly = true,
                                            label = { Text("Unit") },
                                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedUnit) },
                                            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth()
                                        )
                                        ExposedDropdownMenu(expanded = expandedUnit, onDismissRequest = { expandedUnit = false }) {
                                            packSizeTypes.forEach { t ->
                                                DropdownMenuItem(text = { Text(t) }, onClick = { variant.packSizeType = t; draftVariants[vIndex] = variant.copy(); expandedUnit = false })
                                            }
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))
                                Text("Batches", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodyMedium)

                                variant.batches.forEachIndexed { bIndex, batch ->
                                    Card(
                                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest)
                                    ) {
                                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                Text("Batch ${bIndex + 1}", style = MaterialTheme.typography.labelMedium)
                                                if (variant.batches.size > 1) {
                                                    Icon(Icons.Default.Close, contentDescription = "Remove", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp).clickable {
                                                        variant.batches.removeAt(bIndex); draftVariants[vIndex] = variant.copy()
                                                    })
                                                }
                                            }
                                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                OutlinedTextField(value = batch.batchNo, onValueChange = { batch.batchNo = it; draftVariants[vIndex] = variant.copy() }, label = { Text("Batch No *") }, modifier = Modifier.weight(1f))
                                                OutlinedTextField(value = batch.mrp, onValueChange = { batch.mrp = it; draftVariants[vIndex] = variant.copy() }, label = { Text("MRP (₹) *") }, modifier = Modifier.weight(1f))
                                            }
                                            val currentGap = getYearGap(batch.mfgDate, batch.expDate)
                                            Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Text("Mfg & Expiry Dates", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                ExpiryYearsPicker(
                                                    selectedGap = currentGap,
                                                    onGapSelected = { gap ->
                                                        if (batch.mfgDate.isNotBlank()) {
                                                            batch.expDate = calculateExpiryDate(batch.mfgDate, gap)
                                                            draftVariants[vIndex] = variant.copy()
                                                        }
                                                    },
                                                    onClear = {}
                                                )
                                            }
                                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                                DatePickerField(
                                                    value = batch.mfgDate,
                                                    onDateSelected = { newMfg ->
                                                        batch.mfgDate = newMfg
                                                        val gap = currentGap ?: getExpiryGapFromDraftVariants(draftVariants)
                                                        if (gap != null && newMfg.isNotBlank()) {
                                                            batch.expDate = calculateExpiryDate(newMfg, gap)
                                                        }
                                                        draftVariants[vIndex] = variant.copy()
                                                    },
                                                    label = "Mfg Date",
                                                    modifier = Modifier.weight(1f)
                                                )
                                                DatePickerField(
                                                    value = batch.expDate,
                                                    onDateSelected = { newExp ->
                                                        batch.expDate = newExp
                                                        draftVariants[vIndex] = variant.copy()
                                                    },
                                                    label = "Exp Date",
                                                    modifier = Modifier.weight(1f)
                                                )
                                            }
                                            OutlinedTextField(value = batch.unitsSold, onValueChange = { batch.unitsSold = it; draftVariants[vIndex] = variant.copy() }, label = { Text("Units Sold") }, modifier = Modifier.fillMaxWidth())
                                        }
                                    }
                                }
                                TextButton(onClick = { targetVariantForBatchIndex = vIndex }) {
                                    Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Batch")
                                }
                            }
                        }
                    }

                    item {
                        OutlinedButton(onClick = { showAddVariantModal = true }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Add Variant")
                        }
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(
                            onClick = {
                                if (name.isNotBlank() && categoryId.isNotBlank()) {
                                    val builtVariants = draftVariants.map { dVar ->
                                        ProductVariant(
                                            id = dVar.id ?: "",
                                            packSizeValue = dVar.packSizeValue.toDoubleOrNull() ?: dVar.packSizeValue,
                                            packSizeType = dVar.packSizeType,
                                            batches = dVar.batches.map { dB ->
                                                ProductBatch(
                                                    id = dB.id ?: "",
                                                    batchNo = dB.batchNo.ifEmpty { "DEFAULT" },
                                                    mrp = dB.mrp.toDoubleOrNull() ?: 0.0,
                                                    mfgDate = dB.mfgDate.ifEmpty { null },
                                                    expDate = dB.expDate.ifEmpty { null },
                                                    unitsSold = dB.unitsSold.toIntOrNull() ?: 0
                                                )
                                            }
                                        )
                                    }
                                    val updatedProd = Product(
                                        name = name,
                                        categoryId = categoryId,
                                        classification = classification,
                                        variants = builtVariants
                                    )
                                    onSave(updatedProd)
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(56.dp)
                        ) {
                            Text("Save Product", fontSize = 18.sp)
                        }
                    }
                }
            }

            if (showAddVariantModal) {
                val detectedUnit = getDraftVariantsPackUnit(draftVariants).ifBlank { "ML" }
                val detectedGap = getExpiryGapFromDraftVariants(draftVariants)
                AddVariantModal(
                    defaultUnit = detectedUnit,
                    defaultExpiryGap = detectedGap,
                    onDismiss = { showAddVariantModal = false },
                    onAdd = { dVar ->
                        draftVariants.add(dVar)
                        showAddVariantModal = false
                    }
                )
            }

            if (targetVariantForBatchIndex != null) {
                val vIdx = targetVariantForBatchIndex!!
                val targetVariant = draftVariants.getOrNull(vIdx)
                if (targetVariant != null) {
                    val detectedGap = getExpiryGapFromDraftVariants(draftVariants)
                    AddBatchModal(
                        variantPackSize = "${targetVariant.packSizeValue} ${targetVariant.packSizeType}",
                        defaultExpiryGap = detectedGap,
                        onDismiss = { targetVariantForBatchIndex = null },
                        onAdd = { dB ->
                            targetVariant.batches.add(dB)
                            draftVariants[vIdx] = targetVariant.copy()
                            targetVariantForBatchIndex = null
                        }
                    )
                } else {
                    targetVariantForBatchIndex = null
                }
            }
        }
    }

// -----------------------------------------------------------------------------------------
// CATEGORIES DASHBOARD VIEW
// -----------------------------------------------------------------------------------------
@Composable
fun CategoriesDashboardView(
    categories: List<Category>,
    products: List<Product>,
    viewModel: MainViewModel,
    onViewCategoryProducts: (String) -> Unit,
    marqueeEnabled: Boolean = true
) {
    var editCategory by remember { mutableStateOf<Category?>(null) }
    val context = LocalContext.current

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        contentPadding = PaddingValues(top = 8.dp, bottom = 150.dp)
    ) {
        item {
            Text("Category Statistics", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatBox(title = "Total Categories", value = categories.size.toString(), modifier = Modifier.weight(1f))
                StatBox(title = "Total Products", value = products.size.toString(), modifier = Modifier.weight(1f))
                val avgVal = if (categories.isNotEmpty()) String.format(Locale.US, "%.1f", products.size.toDouble() / categories.size) else "0.0"
                StatBox(title = "Avg Products/Cat", value = avgVal, modifier = Modifier.weight(1f))
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        items(categories) { cat ->
            val prodCount = products.count {
                it.category.equals(cat.name, ignoreCase = true) ||
                it.categoryName?.equals(cat.name, ignoreCase = true) == true ||
                it.categoryId == cat.idString
            }
            Card(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = cat.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = if (marqueeEnabled) 1 else 2, overflow = if (marqueeEnabled) TextOverflow.Clip else TextOverflow.Ellipsis, modifier = Modifier.appMarquee(marqueeEnabled))
                        Text(text = "$prodCount Products", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { onViewCategoryProducts(cat.name) }) {
                            Icon(Icons.Default.Visibility, contentDescription = "View Products", tint = MaterialTheme.colorScheme.primary)
                        }
                        IconButton(onClick = { editCategory = cat }) {
                            Icon(Icons.Default.Edit, contentDescription = "Rename", tint = MaterialTheme.colorScheme.primary)
                        }
                        IconButton(onClick = {
                            viewModel.deleteCategory(cat.idString) { success, err ->
                                if (success) {
                                    Toast.makeText(context, "Category deleted", Toast.LENGTH_SHORT).show()
                                    viewModel.loadProducts()
                                } else {
                                    Toast.makeText(context, "Error: $err", Toast.LENGTH_LONG).show()
                                }
                            }
                        }) {
                            Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }

        item {
            VibrantPageBottomFiller(
                title = "Categories Architecture Active",
                subtitle = "Product taxonomy, stats, and catalog grouping configured.",
                icon = Icons.Default.Category,
                containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                contentColor = MaterialTheme.colorScheme.onTertiaryContainer,
                badgeText = "✦ CATEGORY MATRIX"
            )
        }
    }

    if (editCategory != null) {
        var catName by remember { mutableStateOf(editCategory!!.name) }
        AlertDialog(
            onDismissRequest = { editCategory = null },
            title = { Text("Rename Category") },
            text = { OutlinedTextField(value = catName, onValueChange = { catName = it }, label = { Text("New Name") }) },
            confirmButton = { Button(onClick = { viewModel.updateCategory(editCategory!!.idString, catName) { s, _ -> if (s) viewModel.loadProducts(); editCategory = null } }) { Text("Rename") } },
            dismissButton = { TextButton(onClick = { editCategory = null }) { Text("Cancel") } }
        )
    }
}

@Composable
fun StatBox(title: String, value: String, modifier: Modifier = Modifier) {
    ElevatedCard(
        modifier = modifier.fillMaxHeight(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

// -----------------------------------------------------------------------------------------
// NEW HELPER COMPONENTS (MODALS, DATEPICKER FIELD & ALPHABET SLIDER)
// -----------------------------------------------------------------------------------------

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(
    value: String,
    onDateSelected: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier
) {
    var showDatePicker by remember { mutableStateOf(false) }
    val displayValue = formatDateReadable(value)

    OutlinedTextField(
        value = if (displayValue == "N/A") "" else displayValue,
        onValueChange = { onDateSelected(it) },
        label = { Text(label) },
        modifier = modifier.clickable { showDatePicker = true },
        readOnly = true,
        trailingIcon = {
            IconButton(onClick = { showDatePicker = true }) {
                Icon(Icons.Default.DateRange, contentDescription = "Select Date", tint = MaterialTheme.colorScheme.primary)
            }
        }
    )

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState()
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                        sdf.timeZone = TimeZone.getTimeZone("UTC")
                        onDateSelected(sdf.format(Date(millis)))
                    }
                    showDatePicker = false
                }) {
                    Text("OK")
                }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = {
                        onDateSelected("")
                        showDatePicker = false
                    }) {
                        Text("Clear")
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    TextButton(onClick = { showDatePicker = false }) {
                        Text("Cancel")
                    }
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddVariantModal(
    defaultUnit: String = "ML",
    defaultExpiryGap: Int? = null,
    onDismiss: () -> Unit,
    onAdd: (DraftVariant) -> Unit
) {
    var packSizeValue by remember { mutableStateOf("") }
    var packSizeType by remember { mutableStateOf(defaultUnit.ifBlank { "ML" }) }
    var batchNo by remember { mutableStateOf("BATCH-001") }
    var mrp by remember { mutableStateOf("0.00") }
    var mfgDate by remember { mutableStateOf("") }
    var expDate by remember { mutableStateOf("") }
    var unitsSold by remember { mutableStateOf("0") }
    var selectedExpiryGap by remember { mutableStateOf(defaultExpiryGap) }

    var expandedUnit by remember { mutableStateOf(false) }
    val basePackSizeTypes = listOf("ML", "GMS", "TAB", "L", "KG", "PCS", "BOX", "PACK", "CAPS")
    val packSizeTypes = remember(defaultUnit) {
        if (defaultUnit.isNotBlank() && !basePackSizeTypes.contains(defaultUnit)) {
            listOf(defaultUnit) + basePackSizeTypes
        } else {
            basePackSizeTypes
        }
    }

    fun updateMfg(newMfg: String) {
        mfgDate = newMfg
        selectedExpiryGap?.let { gap ->
            if (newMfg.isNotBlank()) {
                expDate = calculateExpiryDate(newMfg, gap)
            }
        }
    }

    fun updateGap(newGap: Int) {
        selectedExpiryGap = newGap
        if (mfgDate.isNotBlank()) {
            expDate = calculateExpiryDate(mfgDate, newGap)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AddCircleOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Add New Variant", fontWeight = FontWeight.Bold)
            }
        },
        text = {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                item {
                    Text("Variant Specifications", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = packSizeValue,
                            onValueChange = { packSizeValue = it },
                            label = { Text("Pack Size *") },
                            placeholder = { Text("e.g. 500") },
                            modifier = Modifier.weight(1f)
                        )
                        ExposedDropdownMenuBox(
                            expanded = expandedUnit,
                            onExpandedChange = { expandedUnit = !expandedUnit },
                            modifier = Modifier.weight(1f)
                        ) {
                            OutlinedTextField(
                                value = packSizeType,
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Unit") },
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expandedUnit) },
                                modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth()
                            )
                            ExposedDropdownMenu(expanded = expandedUnit, onDismissRequest = { expandedUnit = false }) {
                                packSizeTypes.forEach { t ->
                                    DropdownMenuItem(text = { Text(t) }, onClick = { packSizeType = t; expandedUnit = false })
                                }
                            }
                        }
                    }
                }

                item {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                    Text("Initial Batch Info", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                }

                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = batchNo,
                            onValueChange = { batchNo = it },
                            label = { Text("Batch No *") },
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = mrp,
                            onValueChange = { mrp = it },
                            label = { Text("MRP (₹) *") },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Mfg & Expiry Dates", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ExpiryYearsPicker(
                            selectedGap = selectedExpiryGap,
                            onGapSelected = { updateGap(it) },
                            onClear = { selectedExpiryGap = null }
                        )
                    }
                }

                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        DatePickerField(
                            value = mfgDate,
                            onDateSelected = { updateMfg(it) },
                            label = "Mfg Date",
                            modifier = Modifier.weight(1f)
                        )
                        DatePickerField(
                            value = expDate,
                            onDateSelected = { newExp ->
                                expDate = newExp
                                val gap = getYearGap(mfgDate, newExp)
                                if (gap != null) selectedExpiryGap = gap
                            },
                            label = "Exp Date",
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                item {
                    OutlinedTextField(
                        value = unitsSold,
                        onValueChange = { unitsSold = it },
                        label = { Text("Units Sold") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (packSizeValue.isNotBlank()) {
                        val initialBatch = DraftBatch(
                            batchNo = batchNo.ifEmpty { "DEFAULT" },
                            mrp = mrp,
                            mfgDate = mfgDate,
                            expDate = expDate,
                            unitsSold = unitsSold
                        )
                        val newVar = DraftVariant(
                            packSizeValue = packSizeValue,
                            packSizeType = packSizeType,
                            batches = mutableListOf(initialBatch)
                        )
                        onAdd(newVar)
                    }
                }
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            Row {
                OutlinedButton(
                    onClick = {
                        packSizeValue = ""
                        packSizeType = defaultUnit.ifBlank { "ML" }
                        batchNo = ""
                        mrp = "0.00"
                        mfgDate = ""
                        expDate = ""
                        unitsSold = "0"
                        selectedExpiryGap = defaultExpiryGap
                    }
                ) {
                    Text("Clear")
                }
                Spacer(modifier = Modifier.width(8.dp))
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddBatchModal(
    variantPackSize: String,
    defaultExpiryGap: Int? = null,
    onDismiss: () -> Unit,
    onAdd: (DraftBatch) -> Unit
) {
    var batchNo by remember { mutableStateOf("BATCH-001") }
    var mrp by remember { mutableStateOf("0.00") }
    var mfgDate by remember { mutableStateOf("") }
    var expDate by remember { mutableStateOf("") }
    var unitsSold by remember { mutableStateOf("0") }
    var selectedExpiryGap by remember { mutableStateOf(defaultExpiryGap) }

    fun updateMfg(newMfg: String) {
        mfgDate = newMfg
        selectedExpiryGap?.let { gap ->
            if (newMfg.isNotBlank()) {
                expDate = calculateExpiryDate(newMfg, gap)
            }
        }
    }

    fun updateGap(newGap: Int) {
        selectedExpiryGap = newGap
        if (mfgDate.isNotBlank()) {
            expDate = calculateExpiryDate(mfgDate, newGap)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AddCircleOutline, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Add Batch ($variantPackSize)", fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = batchNo,
                        onValueChange = { batchNo = it },
                        label = { Text("Batch No *") },
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = mrp,
                        onValueChange = { mrp = it },
                        label = { Text("MRP (₹) *") },
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Mfg & Expiry Dates", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    ExpiryYearsPicker(
                        selectedGap = selectedExpiryGap,
                        onGapSelected = { updateGap(it) },
                        onClear = { selectedExpiryGap = null }
                    )
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    DatePickerField(
                        value = mfgDate,
                        onDateSelected = { updateMfg(it) },
                        label = "Mfg Date",
                        modifier = Modifier.weight(1f)
                    )
                    DatePickerField(
                        value = expDate,
                        onDateSelected = { newExp ->
                            expDate = newExp
                            val gap = getYearGap(mfgDate, newExp)
                            if (gap != null) selectedExpiryGap = gap
                        },
                        label = "Exp Date",
                        modifier = Modifier.weight(1f)
                    )
                }

                OutlinedTextField(
                    value = unitsSold,
                    onValueChange = { unitsSold = it },
                    label = { Text("Units Sold") },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (batchNo.isNotBlank()) {
                        val newBatch = DraftBatch(
                            batchNo = batchNo,
                            mrp = mrp,
                            mfgDate = mfgDate,
                            expDate = expDate,
                            unitsSold = unitsSold
                        )
                        onAdd(newBatch)
                    }
                }
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            Row {
                OutlinedButton(
                    onClick = {
                        batchNo = ""
                        mrp = "0.00"
                        mfgDate = ""
                        expDate = ""
                        unitsSold = "0"
                        selectedExpiryGap = defaultExpiryGap
                    }
                ) {
                    Text("Clear")
                }
                Spacer(modifier = Modifier.width(8.dp))
                TextButton(onClick = onDismiss) {
                    Text("Cancel")
                }
            }
        }
    )
}

@Composable
fun AlphabetSliderBar(
    selectedLetter: String?,
    onLetterSelected: (String?) -> Unit,
    modifier: Modifier = Modifier
) {
    val alphabet = listOf("All") + ('A'..'Z').map { it.toString() }

    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.85f),
        shape = RoundedCornerShape(16.dp),
        tonalElevation = 4.dp,
        modifier = modifier
    ) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items(alphabet) { letter ->
                val isSelected = (letter == "All" && selectedLetter == null) || (letter == selectedLetter)
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent)
                        .clickable {
                            if (letter == "All" || isSelected) {
                                onLetterSelected(null)
                            } else {
                                onLetterSelected(letter)
                            }
                        }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = letter,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (isSelected) FontWeight.ExtraBold else FontWeight.Medium,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
