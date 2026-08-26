package com.example.macosbusinesssuite.util

import com.google.gson.TypeAdapter
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter

class FlexibleDoubleAdapter : TypeAdapter<Double>() {
    override fun write(out: JsonWriter, value: Double?) {
        if (value == null) {
            out.nullValue()
        } else {
            out.value(value)
        }
    }

    override fun read(reader: JsonReader): Double {
        val peek = reader.peek()
        if (peek == JsonToken.NULL) {
            reader.nextNull()
            return 0.0
        }
        if (peek == JsonToken.NUMBER) {
            return reader.nextDouble()
        }
        if (peek == JsonToken.STRING) {
            val str = reader.nextString().trim()
            return str.toDoubleOrNull() ?: 0.0
        }
        if (peek == JsonToken.BOOLEAN) {
            val b = reader.nextBoolean()
            return if (b) 1.0 else 0.0
        }
        reader.skipValue()
        return 0.0
    }
}

class FlexibleIntAdapter : TypeAdapter<Int>() {
    override fun write(out: JsonWriter, value: Int?) {
        if (value == null) {
            out.nullValue()
        } else {
            out.value(value)
        }
    }

    override fun read(reader: JsonReader): Int {
        val peek = reader.peek()
        if (peek == JsonToken.NULL) {
            reader.nextNull()
            return 0
        }
        if (peek == JsonToken.NUMBER) {
            return reader.nextInt()
        }
        if (peek == JsonToken.STRING) {
            val str = reader.nextString().trim()
            return str.toDoubleOrNull()?.toInt() ?: 0
        }
        if (peek == JsonToken.BOOLEAN) {
            val b = reader.nextBoolean()
            return if (b) 1 else 0
        }
        reader.skipValue()
        return 0
    }
}

class FlexibleStringAdapter : TypeAdapter<String>() {
    override fun write(out: JsonWriter, value: String?) {
        if (value == null) {
            out.nullValue()
        } else {
            out.value(value)
        }
    }

    override fun read(reader: JsonReader): String {
        val peek = reader.peek()
        if (peek == JsonToken.NULL) {
            reader.nextNull()
            return ""
        }
        if (peek == JsonToken.STRING) {
            return reader.nextString()
        }
        if (peek == JsonToken.NUMBER) {
            return reader.nextString()
        }
        if (peek == JsonToken.BOOLEAN) {
            return reader.nextBoolean().toString()
        }
        reader.skipValue()
        return ""
    }
}
