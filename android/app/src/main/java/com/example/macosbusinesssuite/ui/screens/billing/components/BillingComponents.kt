package com.example.macosbusinesssuite.ui.screens.billing.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.macosbusinesssuite.data.model.BillCalculator
import com.example.macosbusinesssuite.data.model.CalculatedLineItem

@Composable
fun AddProductDialog(
    onDismiss: () -> Unit,
    onAdd: (String, CalculatedLineItem) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var rate by remember { mutableStateOf("") }
    var qty by remember { mutableStateOf("1") }
    var disc1 by remember { mutableStateOf("0") }
    var disc2 by remember { mutableStateOf("0") }
    var gst by remember { mutableStateOf("0") }
    var gstReverse by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Product Line Item") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Product Name") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = rate, onValueChange = { rate = it }, label = { Text("Rate (MRP)") }, modifier = Modifier.weight(1f), singleLine = true)
                    OutlinedTextField(value = qty, onValueChange = { qty = it }, label = { Text("Qty") }, modifier = Modifier.weight(1f), singleLine = true)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = disc1, onValueChange = { disc1 = it }, label = { Text("Disc 1 (%)") }, modifier = Modifier.weight(1f), singleLine = true)
                    OutlinedTextField(value = disc2, onValueChange = { disc2 = it }, label = { Text("Disc 2 (%)") }, modifier = Modifier.weight(1f), singleLine = true)
                }
                OutlinedTextField(value = gst, onValueChange = { gst = it }, label = { Text("GST (%)") }, singleLine = true)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = gstReverse, onCheckedChange = { gstReverse = it })
                    Text("Apply GST Reverse (Subtract 4.77% first)")
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val r = rate.toDoubleOrNull() ?: 0.0
                val q = qty.toIntOrNull() ?: 1
                val d1 = disc1.toDoubleOrNull() ?: 0.0
                val d2 = disc2.toDoubleOrNull() ?: 0.0
                val g = gst.toDoubleOrNull() ?: 0.0
                
                val item = BillCalculator.calculateLineItem(
                    productId = "", // Default for manual entry
                    rateInput = r,
                    qtyInput = q,
                    disc1PercentInput = d1,
                    disc2PercentInput = d2,
                    sgstPercentInput = 0.0,
                    cgstPercentInput = 0.0,
                    gstTotalInput = g,
                    gstReverse = gstReverse
                )
                onAdd(name.ifEmpty { "Unknown Product" }, item)
            }) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
