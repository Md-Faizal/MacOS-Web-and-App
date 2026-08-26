package com.example.macosbusinesssuite.util

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DateTimeUtils {

    private val parsers = listOf(
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS", Locale.US),
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US),
        SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US),
        SimpleDateFormat("yyyy-MM-dd", Locale.US),
        SimpleDateFormat("dd-MM-yyyy", Locale.US),
        SimpleDateFormat("dd/MM/yyyy", Locale.US),
        SimpleDateFormat("MM/dd/yyyy", Locale.US),
        SimpleDateFormat("yyyy/MM/dd", Locale.US)
    )

    fun parseDate(dateStr: String?): Date? {
        if (dateStr.isNullOrBlank()) return null
        val trimmed = dateStr.trim()

        // Check epoch timestamp (e.g. 1700000000000)
        trimmed.toLongOrNull()?.let {
            return Date(it)
        }

        val formattedStr = if (trimmed.contains(" ") && !trimmed.contains("T")) {
            trimmed.replace(" ", "T")
        } else trimmed

        for (parser in parsers) {
            try {
                return parser.parse(formattedStr)
            } catch (_: Exception) {}
            try {
                return parser.parse(trimmed)
            } catch (_: Exception) {}
        }
        return null
    }

    fun formatDisplayDate(dateStr: String?, defaultText: String = "N/A"): String {
        val parsed = parseDate(dateStr) ?: return dateStr?.takeIf { it.isNotBlank() } ?: defaultText
        val outFmt = SimpleDateFormat("dd MMM yyyy", Locale.US)
        return outFmt.format(parsed)
    }

    fun formatApiDate(date: Date = Date()): String {
        val outFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        return outFmt.format(date)
    }

    fun formatUiInputDate(date: Date = Date()): String {
        val outFmt = SimpleDateFormat("dd-MM-yyyy", Locale.US)
        return outFmt.format(date)
    }
}
