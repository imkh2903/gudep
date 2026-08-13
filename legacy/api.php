<?php
// Izinkan akses dari mana saja (CORS) & format output JSON
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Konfigurasi Koneksi Database MySQL
$host = "localhost";
$user = "root";
$pass = "";
$dbname = "db_gudep_man1";

$conn = new mysqli($host, $user, $pass, $dbname);

if ($conn->connect_error) {
    die(json_encode(["error" => "Koneksi database gagal: " . $conn->connect_error]));
}

$method = $_SERVER['REQUEST_METHOD'];
$resource = $_GET['resource'] ?? '';

// Tangani Preflight Request (Browser Options)
if ($method === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ----------------------------------------------------
// 1. GET METHOD (Menerima / Ambil Data)
// ----------------------------------------------------
if ($method === 'GET') {
    if (in_array($resource, ['users', 'pengurus', 'dokumen_surat'])) {
        $result = $conn->query("SELECT * FROM $resource ORDER BY id DESC");
        $data = [];
        while ($row = $result->fetch_assoc()) {
            $data[] = $row;
        }
        echo json_encode($data);
    } else {
        echo json_encode(["status" => "error", "message" => "Resource tidak valid"]);
    }
}

// ----------------------------------------------------
// 2. POST METHOD (Tambah Data)
// ----------------------------------------------------
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    // Tambah Pengurus
    if ($resource === 'pengurus') {
        $stmt = $conn->prepare("INSERT INTO pengurus (nama, jabatan, kta, status) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("ssss", $input['nama'], $input['jabatan'], $input['kta'], $input['status']);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "id" => $conn->insert_id]);
        } else {
            echo json_encode(["status" => "error", "message" => $conn->error]);
        }
    } 
    // Tambah Dokumen Surat
    elseif ($resource === 'dokumen_surat') {
        $stmt = $conn->prepare("INSERT INTO dokumen_surat (nomor_surat, perihal, jenis, tanggal, file_path) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("sssss", $input['nomor_surat'], $input['perihal'], $input['jenis'], $input['tanggal'], $input['file_path']);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "id" => $conn->insert_id]);
        } else {
            echo json_encode(["status" => "error", "message" => $conn->error]);
        }
    }
}

// ----------------------------------------------------
// 3. DELETE METHOD (Hapus Data)
// ----------------------------------------------------
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? null;
    
    if (in_array($resource, ['pengurus', 'dokumen_surat', 'users']) && $id) {
        $stmt = $conn->prepare("DELETE FROM $resource WHERE id = ?");
        $stmt->bind_param("i", $id);
        
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Data berhasil dihapus"]);
        } else {
            echo json_encode(["status" => "error", "message" => $conn->error]);
        }
    }
}

$conn->close();
?>