import 'package:flutter/material.dart';
import 'dart:math';
import 'package:intl/intl.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart' as p;

void main() => runApp(const UssdApp());

class UssdApp extends StatelessWidget {
  const UssdApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        fontFamily: 'Roboto', // Mimics standard Android system font
      ),
      home: const HomeScreen(),
    );
  }
}

// --- DATABASE LOGIC ---
class DatabaseHelper {
  static Database? _db;
  static Future<Database> get database async {
    if (_db != null) return _db!;
    _db = await openDatabase(
      p.join(await getDatabasesPath(), 'ussd_final_v3.db'),
      onCreate: (db, version) => db.execute(
        'CREATE TABLE history(id INTEGER PRIMARY KEY, details TEXT, date TEXT, txId TEXT)',
      ),
      version: 1,
    );
    return _db!;
  }

  static Future<void> insertTransaction(String details, String date, String txId) async {
    final db = await database;
    await db.insert('history', {'details': details, 'date': date, 'txId': txId});
  }
}

// --- CONFIGURATION SCREEN ---
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _amt = TextEditingController(text: "600.00");
  final _sender = TextEditingController(text: "KBUR SELEMON ADMASU");
  final _receiver = TextEditingController(text: "BIRUK WONDOSSEN DEMIS");
  final _acc = TextEditingController(text: "2244");

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text("USSD Config", style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _configField(_amt, "Edit amount with .00"),
            _configField(_sender, "Edit your name in all caps"),
            _configField(_receiver, "Receiver Name"),
            _configField(_acc, "Last 4 Digits"),
            const SizedBox(height: 60),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, foregroundColor: Colors.white),
              onPressed: () {
                Navigator.push(context, MaterialPageRoute(
                  builder: (context) => DialerSimulation(
                    amount: _amt.text, sender: _sender.text, receiver: _receiver.text, acc: _acc.text,
                  ),
                ));
              },
              child: const Text("SIMULATE"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _configField(TextEditingController controller, String label) {
    return TextField(
      controller: controller,
      textAlign: TextAlign.center,
      style: const TextStyle(color: Colors.black, fontSize: 17),
      decoration: InputDecoration(hintText: label, hintStyle: const TextStyle(color: Colors.grey)),
    );
  }
}

// --- DIALER & POPUP LOGIC ---
class DialerSimulation extends StatefulWidget {
  final String amount, sender, receiver, acc;
  const DialerSimulation({super.key, required this.amount, required this.sender, required this.receiver, required this.acc});

  @override
  State<DialerSimulation> createState() => _DialerSimulationState();
}

class _DialerSimulationState extends State<DialerSimulation> {
  String dialedNumber = ""; // For the interactive keypad

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _showUssdPopup(stage: 1));
  }

  String _generateTxId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var rnd = Random();
    return "FT${rnd.nextInt(10)}${List.generate(9, (index) => chars[rnd.nextInt(chars.length)]).join()}";
  }

  void _showUssdPopup({required int stage}) {
    TextEditingController inputCtrl = TextEditingController();
    String date = DateFormat('dd-MMM-yyyy').format(DateTime.now()).toUpperCase();
    String txId = _generateTxId();
    
    String content = stage == 1 
      ? "Complete\nETB ${widget.amount} debited from ${widget.sender} for ${widget.receiver}-ETB-${widget.acc} (SGS done via Mobile) on ... Press any key except 1 and 2 for more"
      : "Complete\nETB ${widget.amount} debited from ${widget.sender} for ${widget.receiver}-ETB-${widget.acc} (SGS done via Mobile) on $date with transaction ID: $txId.";

    if (stage == 2) DatabaseHelper.insertTransaction(content, date, txId);

    showDialog(
      context: context,
      barrierDismissible: false,
      barrierColor: Colors.black45,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 18),
        backgroundColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 28, 24, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(content, style: const TextStyle(color: Colors.black87, fontSize: 18, height: 1.25, fontWeight: FontWeight.w400)),
              if (stage == 1) ...[
                const SizedBox(height: 8),
                const Divider(color: Colors.black12, thickness: 1),
                TextField(
                  controller: inputCtrl,
                  autofocus: true,
                  style: const TextStyle(color: Colors.black, fontSize: 18),
                  decoration: const InputDecoration(border: InputBorder.none, isDense: true),
                ),
              ],
              const Divider(color: Colors.black12, thickness: 1),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _dialogBtn("Cancel", () => Navigator.pop(context)),
                  _dialogBtn("Submit", () {
                    if (stage == 1 && inputCtrl.text == "1") {
                      Navigator.pop(context);
                      _showUssdPopup(stage: 2);
                    } else {
                      Navigator.pop(context);
                    }
                  }),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _dialogBtn(String label, VoidCallback onTap) => Expanded(
    child: TextButton(
      onPressed: onTap,
      child: Text(label, style: const TextStyle(color: Color(0xFF007AFF), fontWeight: FontWeight.w600, fontSize: 19)),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("Phone", style: TextStyle(fontSize: 24, fontWeight: FontWeight.w400)),
                  Icon(Icons.search, size: 28),
                ],
              ),
            ),
            // Dialed Number Display
            SizedBox(
              height: 60,
              child: Center(child: Text(dialedNumber, style: const TextStyle(fontSize: 40, color: Colors.white))),
            ),
            const Spacer(),
            _buildKeypad(),
            const SizedBox(height: 30),
            _callButton(),
            const SizedBox(height: 40),
            _navBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildKeypad() {
    final keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 45),
      child: GridView.builder(
        shrinkWrap: true,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, childAspectRatio: 1.4),
        itemCount: 12,
        itemBuilder: (context, i) => InkWell(
          onTap: () => setState(() => dialedNumber += keys[i]),
          child: Center(child: Text(keys[i], style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w300))),
        ),
      ),
    );
  }

  Widget _callButton() => Container(
    height: 75, width: 75,
    decoration: const BoxDecoration(color: Color(0xFF2E7D32), shape: BoxShape.circle),
    child: const Icon(Icons.call, size: 35, color: Colors.white),
  );

  Widget _navBar() => const Row(
    mainAxisAlignment: MainAxisAlignment.spaceAround,
    children: [
      Text("Keypad", style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
      Text("Recents", style: TextStyle(color: Colors.grey)),
      Text("Contacts", style: TextStyle(color: Colors.grey)),
      Text("Places", style: TextStyle(color: Colors.grey)),
    ],
  );
}

// --- HISTORY SCREEN ---
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("History")),
      body: FutureBuilder(
        future: (DatabaseHelper.database).then((db) => db.query('history', orderBy: 'id DESC')),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
          final data = snapshot.data as List<Map<String, dynamic>>;
          return ListView.builder(
            itemCount: data.length,
            itemBuilder: (context, i) => ListTile(
              title: Text(data[i]['txId']),
              subtitle: Text(data[i]['details']),
            ),
          );
        },
      ),
    );
  }
}