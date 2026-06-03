---
name: command-framework
description: Register commands with subcommand routing, tab completion, and permission handling
license: MIT
compatibility: opencode
metadata:
  category: commands
  difficulty: intermediate
---

# Command Framework Skill

## What I Do

Implement a complete command system with subcommand routing, tab completion, permission checking, and input validation.

## Implementation Pattern

### 1. SubCommand Interface

```java
public interface SubCommand {
    void execute(CommandSender sender, String[] args);
    List<String> tabComplete(CommandSender sender, String[] args);
    String getPermission(); // null = no permission required
    String getUsage();
    String getDescription();
}
```

### 2. Main Command Router

```java
public class MyPluginCommand implements CommandExecutor, TabCompleter {

    private final Map<String, SubCommand> subCommands = new LinkedHashMap<>();

    public MyPluginCommand(MyPlugin plugin) {
        subCommands.put("reload", new ReloadSubCommand(plugin));
        subCommands.put("info", new InfoSubCommand(plugin));
        subCommands.put("give", new GiveSubCommand(plugin));
        subCommands.put("help", new HelpSubCommand(subCommands));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage(Component.text("Use /" + label + " help for commands.", NamedTextColor.YELLOW));
            return true;
        }
        SubCommand sub = subCommands.get(args[0].toLowerCase());
        if (sub == null) {
            sender.sendMessage(Component.text("Unknown subcommand. Use /" + label + " help", NamedTextColor.RED));
            return true;
        }
        if (sub.getPermission() != null && !sender.hasPermission(sub.getPermission())) {
            sender.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }
        String[] subArgs = Arrays.copyOfRange(args, 1, args.length);
        sub.execute(sender, subArgs);
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return subCommands.keySet().stream()
                .filter(s -> sender.hasPermission(subCommands.get(s).getPermission()))
                .filter(s -> s.startsWith(args[0].toLowerCase()))
                .collect(Collectors.toList());
        }
        SubCommand sub = subCommands.get(args[0].toLowerCase());
        if (sub != null) {
            return sub.tabComplete(sender, Arrays.copyOfRange(args, 1, args.length));
        }
        return Collections.emptyList(); // NEVER return null
    }
}
```

### 3. Individual SubCommand Implementation

```java
public class GiveSubCommand implements SubCommand {

    private final PlayerDataManager playerDataManager;

    public GiveSubCommand(PlayerDataManager pdm) {
        this.playerDataManager = pdm;
    }

    @Override
    public void execute(CommandSender sender, String[] args) {
        // 1. Argument count validation
        if (args.length < 2) {
            sender.sendMessage(Component.text("Usage: /plugin give <player> <amount>", NamedTextColor.RED));
            return;
        }
        // 2. Player target validation
        Player target = Bukkit.getPlayer(args[0]);
        if (target == null) {
            sender.sendMessage(Component.text("Player '" + args[0] + "' not found.", NamedTextColor.RED));
            return;
        }
        // 3. Numeric input validation
        int amount;
        try {
            amount = Integer.parseInt(args[1]);
        } catch (NumberFormatException e) {
            sender.sendMessage(Component.text("'" + args[1] + "' is not a number.", NamedTextColor.RED));
            return;
        }
        // 4. Range validation
        if (amount < 1 || amount > 10000) {
            sender.sendMessage(Component.text("Amount must be 1-10000.", NamedTextColor.RED));
            return;
        }
        // 5. Execute
        playerDataManager.addTokens(target.getUniqueId(), amount);
        sender.sendMessage(Component.text("Gave " + amount + " to " + target.getName(), NamedTextColor.GREEN));
    }

    @Override
    public List<String> tabComplete(CommandSender sender, String[] args) {
        if (args.length == 1) {
            return Bukkit.getOnlinePlayers().stream()
                .map(Player::getName)
                .filter(n -> n.toLowerCase().startsWith(args[0].toLowerCase()))
                .collect(Collectors.toList());
        }
        if (args.length == 2) return List.of("1", "10", "100", "1000");
        return Collections.emptyList();
    }

    @Override public String getPermission() { return "myplugin.tokens.give"; }
    @Override public String getUsage() { return "<player> <amount>"; }
    @Override public String getDescription() { return "Give tokens to a player"; }
}
```

### 4. Command Registration

```java
// In plugin's onEnable() — register commands EXACTLY ONCE
@Override
public void onEnable() {
    PluginCommand cmd = getCommand("myplugin");
    if (cmd != null) {
        MyPluginCommand executor = new MyPluginCommand(this);
        cmd.setExecutor(executor);
        cmd.setTabCompleter(executor);
    } else {
        getLogger().severe("Command 'myplugin' not found in plugin.yml!");
    }
}
```

### 5. plugin.yml Command Definition

```yaml
commands:
  myplugin:
    description: Main MyPlugin command
    usage: /<command> <subcommand>
    aliases: [mp]
    permission: myplugin.use
    permission-message: You don't have permission.

permissions:
  myplugin.use:
    description: Access to MyPlugin commands
    default: true
  myplugin.tokens.give:
    description: Give tokens to players
    default: op
  myplugin.reload:
    description: Reload plugin configuration
    default: op
```

### 6. BaseCommand Abstract Class (Reduce Boilerplate)

```java
public abstract class BaseCommand implements CommandExecutor, TabCompleter {
    protected final {MainClass} plugin;

    public BaseCommand({MainClass} plugin) { this.plugin = plugin; }

    @Override
    public final boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        // 1. Permission check (fail fast)
        if (getPermission() != null && !sender.hasPermission(getPermission())) {
            sender.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }
        // 2. Player-only check
        if (requiresPlayer() && !(sender instanceof Player)) {
            sender.sendMessage(Component.text("Players only.", NamedTextColor.RED));
            return true;
        }
        // 3. Execute
        execute(sender, args);
        return true;
    }

    protected abstract void execute(CommandSender sender, String[] args);
    protected String getPermission() { return null; }
    protected boolean requiresPlayer() { return false; }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command cmd, String label, String[] args) {
        return Collections.emptyList();
    }
}

// Usage — clean, focused on business logic:
public class BalanceCommand extends BaseCommand {
    private final EconomyManager economy;
    public BalanceCommand(MyPlugin plugin, EconomyManager economy) {
        super(plugin);
        this.economy = economy;
    }
    @Override
    protected void execute(CommandSender sender, String[] args) {
        Player player = (Player) sender;
        double balance = economy.getBalance(player.getUniqueId());
        player.sendMessage(Component.text("Balance: $" + balance, NamedTextColor.GREEN));
    }
    @Override protected String getPermission() { return "myplugin.balance"; }
    @Override protected boolean requiresPlayer() { return true; }
}
```

### 7. Paper Brigadier Commands (Paper 1.20.6+)

```java
@Override
public void onEnable() {
    BrigadierCommand brigadier = getServer().getBrigadierCommand();
    brigadier.getDispatcher().register(
        literal("mycommand")
            .requires(source -> source.getSender().hasPermission("myplugin.command"))
            .then(argument("target", StringArgumentType.word())
                .suggests((ctx, builder) -> {
                    for (Player p : getServer().getOnlinePlayers()) {
                        builder.suggest(p.getName());
                    }
                    return builder.buildFuture();
                })
                .then(argument("amount", IntegerArgumentType.integer(1, 10000))
                    .executes(ctx -> {
                        String target = StringArgumentType.getString(ctx, "target");
                        int amount = IntegerArgumentType.getInteger(ctx, "amount");
                        Player sender = (Player) ctx.getSource().getSender();
                        // Execute command
                        return 1; // Success
                    })
                )
            )
    );
}
```

### 8. Debounce Pattern (Prevent Rapid-Fire Commands)

```java
private final Map<UUID, Long> lastCommandUse = new ConcurrentHashMap<>();
private static final long COOLDOWN_MS = 1000; // 1 second

@Override
public void execute(CommandSender sender, String[] args) {
    if (sender instanceof Player player) {
        UUID uuid = player.getUniqueId();
        long now = System.currentTimeMillis();
        long lastUse = lastCommandUse.getOrDefault(uuid, 0L);
        if (now - lastUse < COOLDOWN_MS) {
            player.sendMessage(Component.text("Slow down! Please wait before using this command again.",
                NamedTextColor.RED));
            return;
        }
        lastCommandUse.put(uuid, now);
    }
    // Proceed with command...
}
```

## Critical Rules

1. **ALWAYS check `args.length` before accessing `args[n]`** — ArrayIndexOutOfBoundsException
2. **ALWAYS wrap `Integer.parseInt()`/`Double.parseDouble()` in try-catch** — NumberFormatException
3. **ALWAYS null-check `Bukkit.getPlayer()`** — returns null if offline
4. **NEVER return null from `onTabComplete()`** — return `Collections.emptyList()`
5. **ONE class per top-level command** — use SubCommand interface for subcommands
6. **Check permission BEFORE any processing** — fail fast with clear message
7. **Register commands in `onEnable()`** — never in constructors
8. **Validate ALL input** — argument count, type, range, permissions, target existence
9. **Use enum for subcommands, not if-else chains** — Map<String, SubCommand>
10. **Consider BaseCommand for boilerplate reduction** — permission, player-only, etc.
11. **Consider Paper Brigadier** for rich argument types and suggestions on Paper 1.20.6+
12. **Cooldowns on expensive commands** — prevent rapid-fire spam of database-heavy operations
