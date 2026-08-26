package com.example.macosbusinesssuite.ui.screens.billing

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.macosbusinesssuite.ui.viewmodels.BillingViewModel
import com.example.macosbusinesssuite.ui.viewmodels.MainViewModel

import androidx.compose.runtime.*
import androidx.navigation.compose.currentBackStackEntryAsState

@Composable
fun BillingScreen(
    viewModel: MainViewModel,
    billingViewModel: BillingViewModel = viewModel(),
    onSubPageToggle: (Boolean) -> Unit = {}
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    LaunchedEffect(currentRoute) {
        val isSubPage = currentRoute != null && currentRoute != "dashboard"
        onSubPageToggle(isSubPage)
    }

    NavHost(
        navController = navController,
        startDestination = "dashboard",
        modifier = Modifier.fillMaxSize()
    ) {
        composable("dashboard") {
            BillingDashboardScreen(navController, billingViewModel, viewModel)
        }
        composable("ledger") {
            CustomerLedgerScreen(navController, billingViewModel)
        }
        composable("detailed_ledger/{customerId}") { backStackEntry ->
            val customerId = backStackEntry.arguments?.getString("customerId") ?: ""
            DetailedLedgerScreen(navController, billingViewModel, customerId)
        }
        composable("new_bill") {
            NewBillScreen(navController, billingViewModel)
        }
        composable("new_order") {
            NewOrderScreen(navController, billingViewModel)
        }
        composable("edit_billing") {
            EditBillingScreen(navController, billingViewModel)
        }
        composable("payments/{type}") { backStackEntry ->
            val initialType = backStackEntry.arguments?.getString("type") ?: "Payment"
            PaymentsCreditNoteScreen(navController, billingViewModel, initialType = initialType)
        }
        composable("payments") {
            PaymentsCreditNoteScreen(navController, billingViewModel, initialType = "Payment")
        }
        composable("history") {
            BillingHistoryScreen(navController, billingViewModel)
        }
    }
}
