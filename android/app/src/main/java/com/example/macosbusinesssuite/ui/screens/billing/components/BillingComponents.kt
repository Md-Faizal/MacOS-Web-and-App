package com.example.macosbusinesssuite.ui.screens.billing.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.macosbusinesssuite.data.model.*

@Composable
fun CustomerPickerDialog(
    contacts: List<Contact>,
    onDismiss: () -> Unit,
    onSelectCustomer: (Contact) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val filteredContacts = remember(contacts, searchQuery) {
        if (searchQuery.isBlank()) contacts
        else contacts.filter {
            it.name.contains(searchQuery, ignoreCase = true) ||
            (it.phone ?: "").contains(searchQuery)
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Customer", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = { Text("Search by name or phone...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                if (filteredContacts.isEmpty()) {
                    Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text("No customers found", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(filteredContacts) { contact ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectCustomer(contact) },
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(contact.name, fontWeight = FontWeight.SemiBold)
                                        if (!contact.phone.isNullOrEmpty()) {
                                            Text(contact.phone, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                    if (contact.openingBalance != 0.0) {
                                        Text(
                                            "Bal: ₹${contact.openingBalance}",
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.Bold,
                                            color = if (contact.openingBalance > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
fun AddProductDialog(
    products: List<Product> = emptyList(),
    onDismiss: () -> Unit,
    onAdd: (String, CalculateBillItemRequest) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var selectedProductId by remember { mutableStateOf<String?>(null) }
    var rate by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf("1") }
    var disc1 by remember { mutableStateOf("0") }
    var disc2 by remember { mutableStateOf("0") }
    var gst by remember { mutableStateOf("0") }
    var scheme by remember { mutableStateOf("") }
    var gstReverse by remember { mutableStateOf(false) }

    // Auto-complete suggestion state
    var showSuggestions by remember { mutableStateOf(false) }
    val matchingProducts = remember(name, products) {
        if (name.length < 2) emptyList()
        else products.filter { it.name.contains(name, ignoreCase = true) }.take(5)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Product Line Item", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 450.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = {
                        name = it
                        showSuggestions = true
                    },
                    label = { Text("Product Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                )

                if (showSuggestions && matchingProducts.isNotEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHighest),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Column {
                            matchingProducts.forEach { p ->
                                Text(
                                    text = "${p.name} ${if (p.price != null && p.price > 0.0) "(₹${p.price})" else ""}",
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            name = p.name
                                            selectedProductId = p.id
                                            if (p.price != null && p.price > 0.0) rate = p.price.toString()
                                            showSuggestions = false
                                        }
                                        .padding(8.dp),
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = rate,
                        onValueChange = { rate = it },
                        label = { Text("Rate / MRP (₹)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                    OutlinedTextField(
                        value = qty,
                        onValueChange = { qty = it },
                        label = { Text("Quantity") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = disc1,
                        onValueChange = { disc1 = it },
                        label = { Text("Disc 1 (%)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                    OutlinedTextField(
                        value = disc2,
                        onValueChange = { disc2 = it },
                        label = { Text("Disc 2 (%)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = gst,
                        onValueChange = { gst = it },
                        label = { Text("GST (%)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                    OutlinedTextField(
                        value = scheme,
                        onValueChange = { scheme = it },
                        label = { Text("Scheme (e.g. 5+1)") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp)
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = gstReverse, onCheckedChange = { gstReverse = it })
                    Text("Apply GST Reverse (Subtract 4.77% first)", style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val r = rate.toDoubleOrNull() ?: 0.0
                    val q = qty.toDoubleOrNull() ?: 1.0
                    val d1 = disc1.toDoubleOrNull() ?: 0.0
                    val d2 = disc2.toDoubleOrNull() ?: 0.0
                    val g = gst.toDoubleOrNull() ?: 0.0

                    val itemReq = CalculateBillItemRequest(
                        productId = selectedProductId,
                        productName = name.ifEmpty { "Product Item" },
                        rate = r,
                        mrp = r,
                        qty = q,
                        disc1 = d1,
                        disc2 = d2,
                        gstPercent = g,
                        gstReverse = gstReverse,
                        scheme = scheme.ifEmpty { null }
                    )
                    onAdd(name.ifEmpty { "Product Item" }, itemReq)
                },
                enabled = name.isNotBlank() && (rate.toDoubleOrNull() ?: 0.0) >= 0.0
            ) {
                Text("Add to Bill")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
