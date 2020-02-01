<?php
namespace PoracleJS\PoracleJS\Telegram\Command\Member;

use Doctrine\DBAL\Configuration;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\ParameterType;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use TelegramBot\Api\BotApi;
use TelegramBot\Api\HttpException;
use TelegramBot\Api\Types\ChatMember;

class CheckCommand extends Command
{
    /**
     * @var BotApi[]
     */
    private $bots;

    /**
     * @var Connection
     */
    private $connection;

    /**
     * @var string
     */
    private $channel;

    /**
     * @var array
     */
    private $allowedStatus = ['administrator', 'creator', 'member'];

    /**
     * @var array
     */
    private $allowedTypes = ['channel', 'group', 'supergroup'];

    public function __construct(string $name = null, BotApi $bot = null, Connection $connection = null)
    {
        parent::__construct($name);

        if ($bot instanceof BotApi) {
            $this->bots[] = $bot;
        }

        if ($connection === null) {
            $config = new Configuration();
            $params = [
                'dbname' => getenv('DB_DATABASE') ?? 'poracledb',
                'driver' => 'mysqli',
                'host' => getenv('DB_HOST') ?? '127.0.0.1',
                'password' => getenv('DB_PASSWORD') ?? 'YourStrongPassw0rd!',
                'port' => getenv('DB_PORT') ?? 3306,
                'user' => getenv('DB_USER') ?? 'poracleuser',
            ];
            $connection = DriverManager::getConnection($params, $config);
        }
        $this->connection = $connection;
    }

    protected function configure()
    {
        $this->setName('Telegram:Member:Check')
            ->setDescription('Checks all known humans having access to the registration channel')
            ->addArgument('token', InputArgument::OPTIONAL, 'Telegram bot token')
            ->addArgument('channel', InputArgument::OPTIONAL, 'Channel id');
    }

    protected function execute(InputInterface $input, OutputInterface $output)
    {
        $tokens = $input->getArgument('token');
        $tokens = $tokens ? explode(',', $tokens) : json_decode((getenv('TLG_TOKEN') ?? ''), true);
        $tokens = array_filter(array_map('trim', $tokens));
        if (empty($tokens)) {
            $output->write('<error>No Telegram token could be found</error>');
            return;
        }

        $this->channel = $input->getArgument('channel') ?: getenv('TLG_REGISTER');
        if (empty($this->channel)) {
            $output->write('<error>No channel id could be found</error>');
            return;
        }

        foreach ((array)$tokens as $token) {
            $this->bots[] = new BotApi($token);
        }

        $queryBuilder = $this->connection->createQueryBuilder();
        $statement = $queryBuilder->select('id', 'name')
            ->from('humans')
            ->where('enabled = 1')
            ->orderBy('name')
            ->execute();

        while ($human = $statement->fetch()) {
            foreach ($this->bots as $bot) {
                if ($this->humanIsMember($bot, $human) || $this->allowHumanByType($bot, $human)) {
                    $output->writeln('<info>User "' . $human['name'] . '" (' . $human['id'] . ') found in channel</info>');
                    continue 2;
                }
            }

            $updateQueryBuilder = $this->connection->createQueryBuilder();
            $updateQueryBuilder->update('humans')
                ->set('enabled', 0)
                ->where('id = ' . $updateQueryBuilder->createNamedParameter($human['id'], ParameterType::STRING))
                ->execute();
            $output->writeln('<error>User "' . $human['name'] . '" (' . $human['id'] . ') removed from channel</error>');
        }
    }

    private function humanIsMember(BotApi $bot, array $human): bool
    {
        try {
            $user = $bot->getChatMember($this->channel, $human['id']);
            return $user instanceof ChatMember && in_array($user->getStatus(), $this->allowedStatus, true);
        } catch (HttpException $exception) {
            // Intentional fallthrough
        }

        return false;
    }

    private function allowHumanByType(BotApi $bot, array $human): bool
    {
        try {
            // Allow all channels
            $chat = $bot->getChat($human['id']);
            return in_array(strtolower($chat->getType()), $this->allowedTypes, true);
        } catch (HttpException $exception) {
            // Intentional fallthrough
        }

        return false;
    }
}
