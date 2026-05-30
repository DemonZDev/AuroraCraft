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

## Critical Rules

1. **ALWAYS check `args.length` before accessing `args[n]`** — ArrayIndexOutOfBoundsException
2. **ALWAYS wrap `Integer.parseInt()` in try-catch** — NumberFormatException
3. **ALWAYS null-check `Bukkit.getPlayer()`** — returns null if offline
4. **NEVER return null from `onTabComplete()`** — return `Collections.emptyList()`
5. **ONE class per top-level command** — use SubCommand interface for subcommands
6. **Check permission BEFORE executing** — fail fast with clear message
7. **Register commands in `onEnable()`** — never in constructors
