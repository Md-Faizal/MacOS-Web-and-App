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
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.example.macosbusinesssuite.data.model.*
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel
import com.example.macosbusinesssuite.ui.screens.billing.components.AddProductDialog

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewBillScreen(
    navController: NavController,
    billingViewModel: BillingViewModel
) {
    var customerName by remember { mutableStateOf("") }
    var selectedCustomerId by remember { mutableStateOf<String?>(null) }
    var showAddProductDialog by remember { mutableStateOf(false) }
    
    // Line items and summary state
    var lineItems by remember { mutableStateOf(listOf<CalculatedLineItem>()) }
    var productNames by remember { mutableStateOf(mapOf<Int, String>()) } // Maps index to product name for display
    
    val summary = remember(lineItems) {
        BillCalculator.calculateBillSummary(lineItems)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Bill", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = { navController.navigateUp() }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            // TODO: Create Bill Request
                        },
                        enabled = customerName.isNotEmpty() && lineItems.isNotEmpty()
                    ) {
                        Text("Save", fontWeight = FontWeight.Bold)
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
                    OutlinedTextField(
                        value = customerName,
                        onValueChange = { customerName = it },
                        label = { Text("Customer Name / Phone") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                }
            }

            // Line Items List
            Text(
                "Products",
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
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
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
                    Divider(modifier = Modifier.padding(vertical = 8.dp), color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.2f))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Grand Total", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("₹${summary.grandTotal}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
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
